// Central config + fail-fast validation of required env.

const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`FATAL: missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

export const config = {
  port: Number(process.env.PORT) || 4000,
  appName: process.env.APP_NAME || 'OptOut',
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  corsOrigins: new Set(list(process.env.CORS_ORIGINS)),

  databaseUrl: process.env.DATABASE_URL,

  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtExpiry: '15m',
  jwtRefreshExpiry: '30d',
  jwtRefreshExpiryMs: 30 * 24 * 60 * 60 * 1000,

  appleServicesId: process.env.APPLE_SERVICES_ID || '',
  googleClientIds: list(process.env.GOOGLE_CLIENT_IDS),

  magicCodeTtlMin: Number(process.env.MAGIC_CODE_TTL_MIN) || 10,

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || `OptOut <no-reply@localhost>`,
  },
};
