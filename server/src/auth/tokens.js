import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';
import { query } from '../db.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function serializeUser(u) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    createdAt: u.created_at,
  };
}

// Issue an access + refresh pair, persisting the refresh token hash.
export async function issueTokens(user) {
  const accessToken = jwt.sign({ userId: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiry,
  });
  const refreshToken = jwt.sign(
    { userId: user.id, tokenId: crypto.randomUUID() },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiry }
  );
  const expiresAt = new Date(Date.now() + config.jwtRefreshExpiryMs);
  await query(
    `INSERT INTO refresh_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [sha(refreshToken), user.id, expiresAt]
  );
  return { accessToken, refreshToken, user: serializeUser(user) };
}

// Verify + rotate a refresh token. Returns the user row or throws.
export async function rotateRefreshToken(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret);
  } catch {
    const e = new Error('Invalid refresh token');
    e.statusCode = 401;
    throw e;
  }
  const hash = sha(refreshToken);
  const { rows } = await query(
    `DELETE FROM refresh_tokens WHERE token_hash = $1 AND expires_at > now() RETURNING user_id`,
    [hash]
  );
  if (!rows.length) {
    const e = new Error('Refresh token expired or revoked');
    e.statusCode = 401;
    throw e;
  }
  const userRes = await query(`SELECT * FROM users WHERE id = $1 AND is_active = true`, [
    rows[0].user_id,
  ]);
  if (!userRes.rows.length) {
    const e = new Error('User not found');
    e.statusCode = 401;
    throw e;
  }
  return userRes.rows[0];
}

export async function revokeRefreshToken(refreshToken) {
  await query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [sha(refreshToken)]);
}
