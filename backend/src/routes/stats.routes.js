/**
 * Estadísticas: semana, racha y resumen general del usuario.
 */
const express = require('express');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const fmt = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

function getMonday(date) {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7; // 0 = lunes
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
}

// GET /api/stats/weekly — L M X J V S D
router.get(
  '/weekly',
  asyncHandler(async (req, res) => {
    const monday = getMonday(new Date());
    const since = fmt(monday);
    const [rows] = await pool.query(
      `SELECT activity_date, workouts_count, total_minutes, total_distance_m, total_calories
         FROM daily_activity
        WHERE user_id = ? AND activity_date >= ? AND activity_date <= ?
        ORDER BY activity_date ASC`,
      [req.user.userId, since, fmt(new Date())]
    );
    const map = new Map(rows.map((r) => [String(r.activity_date).slice(0, 10), r]));
    const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(day.getDate() + i);
      const key = fmt(day);
      const row = map.get(key) || {};
      week.push({
        day: labels[i],
        date: key,
        workouts_count: row.workouts_count || 0,
        total_minutes: row.total_minutes || 0,
        total_distance_m: row.total_distance_m || 0,
        total_calories: row.total_calories || 0,
      });
    }
    res.json({ week });
  })
);

// GET /api/stats/streak
router.get(
  '/streak',
  asyncHandler(async (req, res) => {
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
    res.json({ streak });
  })
);

// GET /api/stats/overview
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const monday = getMonday(new Date());
    const since = fmt(monday);
    const startOfMonth = fmt(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

    const [weekRows] = await pool.query(
      'SELECT activity_date, workouts_count, total_minutes, total_distance_m, total_calories FROM daily_activity WHERE user_id = ? AND activity_date >= ?',
      [req.user.userId, since]
    );
    const [monthRows] = await pool.query(
      'SELECT activity_date, workouts_count, total_minutes, total_distance_m FROM daily_activity WHERE user_id = ? AND activity_date >= ?',
      [req.user.userId, startOfMonth]
    );
    const [totals] = await pool.query(
      `SELECT COUNT(*) AS workouts,
              COALESCE(SUM(duration_seconds), 0) AS seconds,
              COALESCE(SUM(calories), 0) AS calories
         FROM workouts WHERE user_id = ? AND status = 'completed'`,
      [req.user.userId]
    );
    const [gpsTotals] = await pool.query(
      'SELECT COALESCE(SUM(distance_meters), 0) AS distance FROM outdoor_activities WHERE user_id = ?',
      [req.user.userId]
    );

    const [u] = await pool.query('SELECT premium FROM users WHERE id = ? LIMIT 1', [req.user.userId]);
    const premium = !!(u[0] && u[0].premium);

    const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
    const [streakRes] = await pool.query(
      `SELECT DISTINCT activity_date FROM daily_activity
        WHERE user_id = ? AND workouts_count > 0 ORDER BY activity_date DESC LIMIT 400`,
      [req.user.userId]
    );
    const dates = new Set(streakRes.map((r) => fmt(r.activity_date)));
    let streak = 0;
    let day = new Date();
    day.setHours(0, 0, 0, 0);
    if (!dates.has(fmt(day))) day.setDate(day.getDate() - 1);
    while (dates.has(fmt(day))) {
      streak += 1;
      day.setDate(day.getDate() - 1);
    }

    res.json({
      premium,
      week: {
        workouts: sum(weekRows, 'workouts_count'),
        minutes: sum(weekRows, 'total_minutes'),
        distance_m: sum(weekRows, 'total_distance_m'),
        calories: sum(weekRows, 'total_calories'),
      },
      // Métricas avanzadas: solo usuarios Premium
      month: premium
        ? { workouts: sum(monthRows, 'workouts_count'), minutes: sum(monthRows, 'total_minutes') }
        : null,
      totals: premium
        ? {
            workouts: totals[0].workouts,
            minutes: Math.round(totals[0].seconds / 60),
            distance_m: gpsTotals[0].distance,
            calories: totals[0].calories,
          }
        : { workouts: totals[0].workouts },
      streak,
    });
  })
);

module.exports = router;