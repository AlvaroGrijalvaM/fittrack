/**
 * Perfil del usuario y resumen del inicio (dashboard).
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const PUBLIC_COLUMNS =
  'id, name, email, age, weight_kg, height_cm, goal, level, workouts_per_week, premium, avatar_url, timezone, created_at';

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  age: z.number().int().min(12).max(100).nullable().optional(),
  weight_kg: z.number().positive().nullable().optional(),
  height_cm: z.number().positive().nullable().optional(),
  goal: z.enum(['muscle_gain', 'weight_loss', 'endurance', 'general_health', 'flexibility']).nullable().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  workouts_per_week: z.number().int().min(1).max(7).optional(),
});

const fmt = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

function getMonday(date) {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7; // 0 = lunes
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
}

// PUT /api/users/me
router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    const d = parsed.data;

    await pool.query(
      `UPDATE users SET
         name = COALESCE(?, name),
         age = COALESCE(?, age),
         weight_kg = COALESCE(?, weight_kg),
         height_cm = COALESCE(?, height_cm),
         goal = COALESCE(?, goal),
         level = COALESCE(?, level),
         workouts_per_week = COALESCE(?, workouts_per_week)
       WHERE id = ?`,
      [d.name, d.age ?? null, d.weight_kg ?? null, d.height_cm ?? null, d.goal ?? null, d.level ?? null, d.workouts_per_week ?? null, req.user.userId]
    );

    const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [req.user.userId]);
    res.json({ user: rows[0] });
  })
);

// GET /api/users/me/dashboard
router.get(
  '/me/dashboard',
  asyncHandler(async (req, res) => {
    const [userRows] = await pool.query(
      `SELECT name, premium, workouts_per_week, goal, level FROM users WHERE id = ? LIMIT 1`,
      [req.user.userId]
    );
    if (!userRows.length) throw new HttpError(404, 'Usuario no encontrado');
    const user = userRows[0];

    // Resumen de la semana (lunes a hoy)
    const since = fmt(getMonday(new Date()));
    const [weekRows] = await pool.query(
      `SELECT activity_date, workouts_count, total_minutes, total_distance_m, total_calories
         FROM daily_activity
        WHERE user_id = ? AND activity_date >= ?
        ORDER BY activity_date ASC`,
      [req.user.userId, since]
    );
    const workoutsCompleted = weekRows.reduce((s, r) => s + (r.workouts_count || 0), 0);
    const minutesThisWeek = weekRows.reduce((s, r) => s + (r.total_minutes || 0), 0);
    const target = user.workouts_per_week || 3;
    const percent = Math.min(100, Math.round((workoutsCompleted / target) * 100));

    // Racha actual
    const [daysRows] = await pool.query(
      `SELECT DISTINCT activity_date FROM daily_activity
        WHERE user_id = ? AND workouts_count > 0
        ORDER BY activity_date DESC LIMIT 400`,
      [req.user.userId]
    );
    const dates = new Set(daysRows.map((r) => fmt(r.activity_date)));
    let streak = 0;
    let day = new Date();
    day.setHours(0, 0, 0, 0);
    if (!dates.has(fmt(day))) day.setDate(day.getDate() - 1);
    while (dates.has(fmt(day))) {
      streak += 1;
      day.setDate(day.getDate() - 1);
    }

    // Rutina del día (rotación simple de plantillas accesibles)
    const [routines] = await pool.query(
      `SELECT id, name, description, level, estimated_minutes
         FROM routines
        WHERE is_template = 1 AND (is_premium = 0 OR ? = 1)
        ORDER BY id LIMIT 100`,
      [user.premium ? 1 : 0]
    );
    const dayIndex = Math.floor(Date.now() / 86400000);
    const todayRoutine = routines.length ? routines[dayIndex % routines.length] : null;

    // Objetivos activos
    const [goals] = await pool.query(
      `SELECT id, type, title, target, current, unit, period, target_date
         FROM goals WHERE user_id = ? AND completed = 0
        ORDER BY created_at DESC LIMIT 5`,
      [req.user.userId]
    );

    // Entrenamientos recientes
    const [lastWorkouts] = await pool.query(
      `SELECT id, name, activity_type, started_at, duration_seconds, calories
         FROM workouts
        WHERE user_id = ? AND status = 'completed'
        ORDER BY started_at DESC LIMIT 5`,
      [req.user.userId]
    );

    res.json({
      user: { name: user.name, premium: !!user.premium, goal: user.goal, level: user.level },
      week: { workoutsCompleted, workoutsTarget: target, minutesThisWeek, percent },
      streak,
      todayRoutine,
      goals,
      lastWorkouts,
    });
  })
);

module.exports = router;