import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuth } from './auth/middleware.js';
import authRoutes from './routes/auth.js';
import categoriesRoutes from './routes/categories.js';
import entriesRoutes from './routes/entries.js';
import jarsRoutes from './routes/jars.js';
import statsRoutes from './routes/stats.js';

const app = express();
// Behind a loopback reverse proxy (Apache/nginx) — trust it so req.ip is the real client.
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));

// CORS — allow configured origins (Expo web/dev). Native app sends no Origin.
app.use((req, res, next) => {
  const origin = req.header('Origin');
  if (origin && config.corsOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Global per-IP limiter.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests' },
  })
);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// Public auth routes.
app.use('/api/auth', authRoutes);

// Authenticated routes.
app.get('/api/me', requireAuth, async (req, res) => {
  res.json({ success: true, user: { id: req.user.id, email: req.user.email } });
});
app.use('/api/categories', requireAuth, categoriesRoutes);
app.use('/api/entries', requireAuth, entriesRoutes);
app.use('/api/jars', requireAuth, jarsRoutes);
app.use('/api/stats', requireAuth, statsRoutes);

app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// Error handler.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Bind to loopback only — all external traffic must come through the Apache
// reverse proxy over HTTPS (same posture as the flamingos/PinkSync server).
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`${config.appName} API listening on 127.0.0.1:${config.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
