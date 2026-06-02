import { createRemoteJWKSet, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';

// ── Apple ───────────────────────────────────────────────────────
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

// Verify an Apple identity token. Returns { sub, email }.
export async function verifyAppleToken(identityToken) {
  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: config.appleServicesId || undefined,
  });
  return { sub: payload.sub, email: payload.email || '' };
}

// ── Google ──────────────────────────────────────────────────────
const googleClient = new OAuth2Client();

// Verify a Google ID token against the accepted client IDs. Returns { sub, email }.
export async function verifyGoogleToken(idToken) {
  if (!config.googleClientIds.length) {
    throw new Error('Google sign-in not configured');
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientIds,
  });
  const payload = ticket.getPayload();
  return { sub: payload.sub, email: payload.email || '' };
}
