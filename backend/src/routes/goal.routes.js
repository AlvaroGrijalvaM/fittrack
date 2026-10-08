/**
 * Objetivos/metas del usuario (CRUD).
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const goalSchema = z.object({
  type: z.enum(['weekly_workouts', 'weekly_minutes', 'weekly_distance', 'weight', 'streak_days', 'custom']),
  title: z.string().min(1, 'Escribe el nombre de tu objetivo').max(120),
  target: z.number().positive(),
  unit: z.string().max(20).optional().default('sessions'),
  period: z.enum(['day', 'week', 'month', 'custom']).optional().default('week'),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const updateSchema = goalSchema.partial().extend({
  current: z.number().nonnegative().optional(),
  completed: z.boolean().optional(),
});

// GET /api/goals
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM goals WHERE user_id = ? ORDER BY completed ASC, created_at DESC',
      [req.user.userId]
    );
    res.json({ goals: rows });
  })
);

// POST /api/goals
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = goalSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    const d = parsed.data;

    const [ins] = await pool.query(
      `INSERT INTO goals (user_id, type, title, target, current, unit, period, starts_on, target_date)
       VALUES (?, ?, ?, ?, 0, ?, ?, IFNULL(?, CURRENT_DATE), ?)`,
      [req.user.userId, d.type, d.title, d.target, d.unit, d.period, d.starts_on ?? null, d.target_date ?? null]
    );
    const [rows] = await pool.query('SELECT * FROM goals WHERE id = ?', [ins.insertId]);
    res.status(201).json({ goal: rows[0] });
  })
);

// PATCH /api/goals/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Datos inválidos');
    const d = parsed.data;

    const [existing] = await pool.query('SELECT id FROM goals WHERE id = ? AND user_id = ? LIMIT 1', [
      id,
      req.user.userId,
    ]);
    if (!existing.length) throw new HttpError(404, 'Objetivo no encontrado');

    const sets = [];
    const params = [];
    if (d.title !== undefined) { sets.push('title = ?'); params.push(d.title); }
    if (d.type !== undefined) { sets.push('type = ?'); params.push(d.type); }
    if (d.target !== undefined) { sets.push('target = ?'); params.push(d.target); }
    if (d.current !== undefined) { sets.push('current = ?'); params.push(d.current); }
    if (d.unit !== undefined) { sets.push('unit = ?'); params.push(d.unit); }
    if (d.period !== undefined) { sets.push('period = ?'); params.push(d.period); }
    if (d.starts_on !== undefined) { sets.push('starts_on = ?'); params.push(d.starts_on); }
    if (d.target_date !== undefined) { sets.push('target_date = ?'); params.push(d.target_date); }
    if (d.completed !== undefined) {
      sets.push('completed = ?', 'completed_at = IF(? = 1, NOW(), NULL)');
      params.push(d.completed ? 1 : 0, d.completed ? 1 : 0);
    }
    if (!sets.length) throw new HttpError(400, 'No hay campos para actualizar');
    params.push(id);
    await pool.query(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.query('SELECT * FROM goals WHERE id = ?', [id]);
    res.json({ goal: rows[0] });
  })
);

// DELETE /api/goals/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const [result] = await pool.query('DELETE FROM goals WHERE id = ? AND user_id = ?', [
      Number(req.params.id),
      req.user.userId,
    ]);
    if (!result.affectedRows) throw new HttpError(404, 'Objetivo no encontrado');
    res.json({ ok: true });
  })
);

module.exports = router;