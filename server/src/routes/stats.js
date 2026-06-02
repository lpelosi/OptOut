import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /stats/summary — lifetime, this month, this week totals + counts.
router.get('/summary', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(amount), 0)                                              AS lifetime,
         COUNT(*)                                                              AS lifetime_count,
         COALESCE(SUM(amount) FILTER (WHERE occurred_at >= date_trunc('month', now())), 0) AS month,
         COALESCE(SUM(amount) FILTER (WHERE occurred_at >= date_trunc('week',  now())), 0) AS week
       FROM entries WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ success: true, summary: rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /stats/by-category?from=&to=
router.get('/by-category', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const params = [req.user.id];
    const where = ['e.user_id = $1'];
    if (from) { params.push(from); where.push(`e.occurred_at >= $${params.length}`); }
    if (to) { params.push(to); where.push(`e.occurred_at <= $${params.length}`); }
    const { rows } = await query(
      `SELECT c.id AS category_id, COALESCE(c.name, 'Uncategorized') AS name,
              c.color, c.icon, COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS count
         FROM entries e
         LEFT JOIN categories c ON c.id = e.category_id
        WHERE ${where.join(' AND ')}
        GROUP BY c.id, c.name, c.color, c.icon
        ORDER BY total DESC`,
      params
    );
    res.json({ success: true, categories: rows });
  } catch (err) {
    next(err);
  }
});

// GET /stats/timeline?bucket=day|week|month&from=&to=
router.get('/timeline', async (req, res, next) => {
  try {
    const bucket = ['day', 'week', 'month'].includes(req.query.bucket) ? req.query.bucket : 'month';
    const { from, to } = req.query;
    const params = [req.user.id];
    const where = ['user_id = $1'];
    if (from) { params.push(from); where.push(`occurred_at >= $${params.length}`); }
    if (to) { params.push(to); where.push(`occurred_at <= $${params.length}`); }
    const { rows } = await query(
      `SELECT date_trunc('${bucket}', occurred_at) AS period,
              COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
         FROM entries
        WHERE ${where.join(' AND ')}
        GROUP BY period ORDER BY period`,
      params
    );
    res.json({ success: true, bucket, points: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
