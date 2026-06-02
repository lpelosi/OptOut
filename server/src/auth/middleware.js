import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

// Require a valid access token. Attaches req.user = { id }.
export async function requireAuth(req, res, next) {
  const header = req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing bearer token' });
  }
  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res
      .status(401)
      .json({ success: false, message: expired ? 'Token expired' : 'Invalid token' });
  }
  const { rows } = await query(`SELECT id, email FROM users WHERE id = $1 AND is_active = true`, [
    payload.userId,
  ]);
  if (!rows.length) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }
  req.user = { id: rows[0].id, email: rows[0].email };
  next();
}
