import { createRemoteJWKSet, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';

// ── Apple ───────────────────────────────────────────────────────
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

// Apple/Google send email_verified as a boolean or the string "true".
const isVerified = (v) => v === true || v === 'true';

// Verify an Apple identity token. Returns { sub, email, emailVerified }.
// Audience is enforced — never accept a token minted for another app. If the
// OptOut App ID isn't configured we refuse Apple sign-in rather than skip the check.
export async function verifyAppleToken(identityToken) {
  if (!config.appleServicesId) {
    throw new Error('Apple sign-in not configured (APPLE_SERVICES_ID unset)');
  }
  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: config.appleServicesId,
  });
  return { sub: payload.sub, email: payload.email || '', emailVerified: isVerified(payload.email_verified) };
}

// ── Google ──────────────────────────────────────────────────────
const googleClient = new OAuth2Client();

// Verify a Google ID token against the accepted client IDs. Returns { sub, email, emailVerified }.
export async function verifyGoogleToken(idToken) {
  if (!config.googleClientIds.length) {
    throw new Error('Google sign-in not configured');
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientIds,
  });
  const payload = ticket.getPayload();
  return { sub: payload.sub, email: payload.email || '', emailVerified: isVerified(payload.email_verified) };
}
