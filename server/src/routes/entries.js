import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Reject references to a category or jar the caller doesn't own (prevents IDOR —
// e.g. tagging an entry to someone else's jar). Built-in categories (user_id IS NULL)
// are shared and allowed. Throws an error with statusCode 400 on a bad reference.
async function assertOwnedRefs(userId, { categoryId, jarId }) {
  if (categoryId) {
    const r = await query(
      `SELECT 1 FROM categories WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
      [categoryId, userId]
    );
    if (!r.rows.length) {
      const e = new Error('category not found');
      e.statusCode = 400;
      throw e;
    }
  }
  if (jarId) {
    const r = await query(`SELECT 1 FROM jars WHERE id = $1 AND user_id = $2`, [jarId, userId]);
    if (!r.rows.length) {
      const e = new Error('jar not found');
      e.statusCode = 400;
      throw e;
    }
  }
}

const SELECT = `
  SELECT e.id, e.amount, e.direction, e.note, e.occurred_at, e.created_at,
         e.category_id, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
         e.jar_id, j.name AS jar_name
    FROM entries e
    LEFT JOIN categories c ON c.id = e.category_id
    LEFT JOIN jars j ON j.id = e.jar_id`;

// GET /entries?from=&to=&category=&jar=&limit=&cursor=
// Keyset pagination on (occurred_at, id) descending; cursor = ISO occurred_at of last row.
router.get('/', async (req, res, next) => {
  try {
    const { from, to, category, jar, cursor } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const params = [req.user.id];
    const where = ['e.user_id = $1'];
    if (from) { params.push(from); where.push(`e.occurred_at >= $${params.length}`); }
    if (to) { params.push(to); where.push(`e.occurred_at <= $${params.length}`); }
    if (category) { params.push(category); where.push(`e.category_id = $${params.length}`); }
    if (jar) { params.push(jar); where.push(`e.jar_id = $${params.length}`); }
    if (cursor) { params.push(cursor); where.push(`e.occurred_at < $${params.length}`); }
    params.push(limit);
    const { rows } = await query(
      `${SELECT} WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC, e.id DESC LIMIT $${params.length}`,
      params
    );
    const nextCursor = rows.length === limit ? rows[rows.length - 1].occurred_at : null;
    res.json({ success: true, entries: rows, nextCursor });
  } catch (err) {
    next(err);
  }
});

// POST /entries
router.post('/', async (req, res, next) => {
  try {
    const { amount, categoryId, note, occurredAt, jarId, direction } = req.body || {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).json({ success: false, message: 'amount must be a non-negative number' });
    }
    const dir = direction === 'spent' ? 'spent' : 'saved';
    await assertOwnedRefs(req.user.id, { categoryId, jarId });
    const ins = await query(
      `INSERT INTO entries (user_id, category_id, jar_id, amount, direction, note, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now())) RETURNING id`,
      [req.user.id, categoryId || null, jarId || null, amt, dir, note?.trim() || null, occurredAt || null]
    );
    const { rows } = await query(`${SELECT} WHERE e.id = $1`, [ins.rows[0].id]);
    res.status(201).json({ success: true, entry: rows[0] });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    next(err);
  }
});

// PATCH /entries/:id — only fields present in the body are changed.
// categoryId/jarId may be explicitly set to null to clear them.
const PATCHABLE = { amount: 'amount', categoryId: 'category_id', jarId: 'jar_id', note: 'note', occurredAt: 'occurred_at', direction: 'direction' };
router.patch('/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    if ('direction' in body && body.direction !== 'saved' && body.direction !== 'spent') {
      return res.status(400).json({ success: false, message: "direction must be 'saved' or 'spent'" });
    }
    const sets = [];
    const params = [req.params.id, req.user.id];
    for (const [key, col] of Object.entries(PATCHABLE)) {
      if (key in body) {
        params.push(body[key]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    await assertOwnedRefs(req.user.id, { categoryId: body.categoryId, jarId: body.jarId });
    const { rows } = await query(
      `UPDATE entries SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING id`,
      params
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Entry not found' });
    const full = await query(`${SELECT} WHERE e.id = $1`, [rows[0].id]);
    res.json({ success: true, entry: full.rows[0] });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    next(err);
  }
});

// DELETE /entries/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query(`DELETE FROM entries WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user.id,
    ]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Entry not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
