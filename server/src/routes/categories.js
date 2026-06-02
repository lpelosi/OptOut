import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /categories — built-in defaults + the user's own, ordered.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, user_id IS NULL AS is_default, name, icon, color, default_amount, sort_order
         FROM categories
        WHERE user_id IS NULL OR user_id = $1
        ORDER BY user_id IS NULL DESC, sort_order, name`,
      [req.user.id]
    );
    res.json({ success: true, categories: rows });
  } catch (err) {
    next(err);
  }
});

// POST /categories — create a custom category.
router.post('/', async (req, res, next) => {
  try {
    const { name, icon, color, defaultAmount } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'name required' });
    const { rows } = await query(
      `INSERT INTO categories (user_id, name, icon, color, default_amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, name.trim(), icon || 'tag', color || '#4F8A8B', defaultAmount ?? null]
    );
    res.status(201).json({ success: true, category: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /categories/:id — own categories only.
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, icon, color, defaultAmount } = req.body || {};
    const { rows } = await query(
      `UPDATE categories SET
         name = COALESCE($2, name),
         icon = COALESCE($3, icon),
         color = COALESCE($4, color),
         default_amount = COALESCE($5, default_amount)
       WHERE id = $1 AND user_id = $6 RETURNING *`,
      [req.params.id, name, icon, color, defaultAmount, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, category: rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /categories/:id — own only. Entries keep history (category set null).
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query(`DELETE FROM categories WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user.id,
    ]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Category not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
