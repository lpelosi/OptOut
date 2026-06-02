import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { query } from '../db.js';
import { issueTokens, rotateRefreshToken, revokeRefreshToken } from '../auth/tokens.js';
import { verifyAppleToken, verifyGoogleToken } from '../auth/providers.js';
import { sendLoginCode } from '../mailer.js';
import { requireAuth } from '../auth/middleware.js';

// Apple sends fullName only on first authorization. Native clients send it as a
// { givenName, familyName } object (PinkSync convention); our RN app sends a string.
function nameToString(fullName) {
  if (typeof fullName === 'string') return fullName.trim();
  if (fullName && typeof fullName === 'object') {
    return [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim();
  }
  return undefined;
}

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Per-email limiter for failed password logins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => (req.body?.email || '').toLowerCase().trim() || 'unknown',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts for this account' },
});
// Per-email limiter for magic-code requests (anti-spam).
const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => (req.body?.email || '').toLowerCase().trim() || 'unknown',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many code requests. Try again later.' },
});

// Find a user by provider id or email, else create one. A provider `sub` is only
// auto-linked to a pre-existing account when the provider asserts the email is verified —
// otherwise an attacker controlling an unverified-email provider account could take over
// an existing OptOut account that shares that address.
async function findOrCreateUser({ provider, sub, email, emailVerified, displayName }) {
  const col = provider === 'apple' ? 'apple_user_id' : 'google_user_id';
  let res = await query(`SELECT * FROM users WHERE ${col} = $1 AND is_active = true`, [sub]);
  if (res.rows.length) return res.rows[0];

  if (email) {
    res = await query(`SELECT * FROM users WHERE email = $1 AND is_active = true`, [email]);
    if (res.rows.length) {
      if (!emailVerified) {
        const e = new Error('An account already uses this email. Sign in with your original method first, then link this provider.');
        e.statusCode = 409;
        throw e;
      }
      const updated = await query(
        `UPDATE users SET ${col} = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [sub, res.rows[0].id]
      );
      return updated.rows[0];
    }
  }
  const name = displayName?.trim() || (email ? email.split('@')[0] : 'Saver');
  const created = await query(
    `INSERT INTO users (email, display_name, ${col}) VALUES ($1, $2, $3) RETURNING *`,
    [email || `${sub}@${provider}.local`, name, sub]
  );
  return created.rows[0];
}

// POST /auth/apple
router.post('/apple', async (req, res, next) => {
  try {
    const { identityToken, fullName } = req.body || {};
    if (!identityToken) return res.status(400).json({ success: false, message: 'identityToken required' });
    let info;
    try {
      info = await verifyAppleToken(identityToken);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid Apple identity token' });
    }
    const user = await findOrCreateUser({
      provider: 'apple',
      sub: info.sub,
      email: info.email,
      emailVerified: info.emailVerified,
      displayName: nameToString(fullName),
    });
    res.json({ success: true, ...(await issueTokens(user)) });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    next(err);
  }
});

// POST /auth/google
router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ success: false, message: 'idToken required' });
    let info;
    try {
      info = await verifyGoogleToken(idToken);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid Google token' });
    }
    const user = await findOrCreateUser({
      provider: 'google',
      sub: info.sub,
      email: info.email,
      emailVerified: info.emailVerified,
    });
    res.json({ success: true, ...(await issueTokens(user)) });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    next(err);
  }
});

// POST /auth/magic/request — generate + email a 6-digit code.
router.post('/magic/request', codeLimiter, async (req, res, next) => {
  try {
    const email = (req.body?.email || '').toLowerCase().trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, message: 'Valid email required' });

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + config.magicCodeTtlMin * 60 * 1000);
    await query(
      `INSERT INTO login_codes (email, code_hash, expires_at, attempts)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (email) DO UPDATE SET code_hash = $2, expires_at = $3, attempts = 0, created_at = now()`,
      [email, sha(code), expiresAt]
    );
    await sendLoginCode(email, code);
    res.json({ success: true }); // never reveals whether the email exists
  } catch (err) {
    next(err);
  }
});

// POST /auth/magic/verify — exchange a code for tokens (creates the user on first sign-in).
router.post('/magic/verify', async (req, res, next) => {
  try {
    const email = (req.body?.email || '').toLowerCase().trim();
    const code = (req.body?.code || '').trim();
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Email and 6-digit code required' });
    }
    const { rows } = await query(`SELECT * FROM login_codes WHERE email = $1`, [email]);
    const rec = rows[0];
    if (!rec || new Date(rec.expires_at).getTime() < Date.now() || rec.attempts >= 5) {
      return res.status(401).json({ success: false, message: 'Code expired or invalid. Request a new one.' });
    }
    if (rec.code_hash !== sha(code)) {
      await query(`UPDATE login_codes SET attempts = attempts + 1 WHERE email = $1`, [email]);
      return res.status(401).json({ success: false, message: 'Incorrect code' });
    }
    await query(`DELETE FROM login_codes WHERE email = $1`, [email]);

    let userRes = await query(`SELECT * FROM users WHERE email = $1 AND is_active = true`, [email]);
    let user = userRes.rows[0];
    if (!user) {
      const created = await query(
        `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING *`,
        [email, email.split('@')[0]]
      );
      user = created.rows[0];
    }
    res.json({ success: true, ...(await issueTokens(user)) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/register — email + password.
router.post('/register', async (req, res, next) => {
  try {
    const email = (req.body?.email || '').toLowerCase().trim();
    const { displayName, password } = req.body || {};
    if (!EMAIL_RE.test(email) || !displayName || !password) {
      return res.status(400).json({ success: false, message: 'Email, name, and password required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    const exists = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (exists.rows.length) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    const created = await query(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING *`,
      [email, displayName.trim(), bcrypt.hashSync(password, 12)]
    );
    res.json({ success: true, ...(await issueTokens(created.rows[0])) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login — email + password.
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = (req.body?.email || '').toLowerCase().trim();
    const { password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    const { rows } = await query(`SELECT * FROM users WHERE email = $1 AND is_active = true`, [email]);
    const user = rows[0];
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    res.json({ success: true, ...(await issueTokens(user)) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ success: false, message: 'refreshToken required' });
    const user = await rotateRefreshToken(refreshToken);
    res.json({ success: true, ...(await issueTokens(user)) });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    next(err);
  }
});

// POST /auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /auth/delete-account — App Store requirement for apps with account creation.
// Cascades to entries/categories/jars/refresh_tokens via ON DELETE CASCADE.
router.delete('/delete-account', requireAuth, async (req, res, next) => {
  try {
    await query(`DELETE FROM users WHERE id = $1`, [req.user.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
