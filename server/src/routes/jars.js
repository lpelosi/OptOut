import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Jars with computed balance (sum of tagged entries) + progress.
const SELECT = `
  SELECT j.id, j.name, j.icon, j.color, j.target_amount, j.created_at, j.completed_at,
         COALESCE(SUM(e.amount), 0) AS balance
    FROM jars j
    LEFT JOIN entries e ON e.jar_id = j.id AND e.user_id = j.user_id
   WHERE j.user_id = $1`;

const withProgress = (j) => ({
  ...j,
  progress: j.target_amount > 0 ? Math.min(1, j.balance / j.target_amount) : 0,
});

// GET /jars
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `${SELECT} GROUP BY j.id ORDER BY j.completed_at IS NOT NULL, j.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, jars: rows.map(withProgress) });
  } catch (err) {
    next(err);
  }
});

// POST /jars
router.post('/', async (req, res, next) => {
  try {
    const { name, targetAmount, icon, color } = req.body || {};
    const target = Number(targetAmount);
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'name required' });
    if (!Number.isFinite(target) || target <= 0) {
      return res.status(400).json({ success: false, message: 'targetAmount must be a positive number' });
    }
    const { rows } = await query(
      `INSERT INTO jars (user_id, name, target_amount, icon, color)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, name.trim(), target, icon || 'piggy-bank', color || '#4F8A8B']
    );
    const full = await query(`${SELECT} AND j.id = $2 GROUP BY j.id`, [req.user.id, rows[0].id]);
    res.status(201).json({ success: true, jar: withProgress(full.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PATCH /jars/:id — update fields; pass completed:true to stamp completion.
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, targetAmount, icon, color, completed } = req.body || {};
    const { rows } = await query(
      `UPDATE jars SET
         name = COALESCE($3, name),
         target_amount = COALESCE($4, target_amount),
         icon = COALESCE($5, icon),
         color = COALESCE($6, color),
         completed_at = CASE WHEN $7::boolean IS TRUE THEN now()
                             WHEN $7::boolean IS FALSE THEN NULL
                             ELSE completed_at END
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id, name, targetAmount, icon, color, completed ?? null]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Jar not found' });
    const full = await query(`${SELECT} AND j.id = $2 GROUP BY j.id`, [req.user.id, req.params.id]);
    res.json({ success: true, jar: withProgress(full.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// DELETE /jars/:id — entries keep history (jar_id set null on delete).
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query(`DELETE FROM jars WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user.id,
    ]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Jar not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /jars/:id/allocate — tag a set of entries to this jar.
router.post('/:id/allocate', async (req, res, next) => {
  try {
    const { entryIds } = req.body || {};
    if (!Array.isArray(entryIds) || !entryIds.length) {
      return res.status(400).json({ success: false, message: 'entryIds array required' });
    }
    const owns = await query(`SELECT 1 FROM jars WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user.id,
    ]);
    if (!owns.rows.length) return res.status(404).json({ success: false, message: 'Jar not found' });
    await query(
      `UPDATE entries SET jar_id = $1 WHERE user_id = $2 AND id = ANY($3::uuid[])`,
      [req.params.id, req.user.id, entryIds]
    );
    const full = await query(`${SELECT} AND j.id = $2 GROUP BY j.id`, [req.user.id, req.params.id]);
    res.json({ success: true, jar: withProgress(full.rows[0]) });
  } catch (err) {
    next(err);
  }
});

export default router;
