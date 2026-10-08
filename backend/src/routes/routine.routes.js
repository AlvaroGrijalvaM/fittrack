/**
 * Rutinas: listado, detalle, creación Premium y favoritas.
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { authRequired, requirePremium } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const routineExerciseSchema = z.object({
  exercise_id: z.number().int().positive(),
  position: z.number().int().positive().optional(),
  sets: z.number().int().positive().optional().default(3),
  repetitions: z.number().int().positive().nullable().optional(),
  duration_seconds: z.number().int().positive().nullable().optional(),
  rest_seconds: z.number().int().min(0).optional().default(60),
  weight_kg: z.number().nonnegative().nullable().optional(),
});

const createRoutineSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  description: z.string().max(500).optional().default(''),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('beginner'),
  exercises: z.array(routineExerciseSchema).min(1, 'Agrega al menos un ejercicio'),
});

// GET /api/routines
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [userRows] = await pool.query('SELECT premium FROM users WHERE id = ? LIMIT 1', [req.user.userId]);
    const premium = !!(userRows[0] && userRows[0].premium);

    const [rows] = await pool.query(
      `SELECT r.id, r.user_id, r.name, r.description, r.level, r.is_premium,
              r.is_template, r.estimated_minutes, COUNT(re.id) AS exercise_count
         FROM routines r
         LEFT JOIN routine_exercises re ON re.routine_id = r.id
        WHERE (r.is_premium = 0 OR ? = 1)
          AND (r.is_template = 1 OR r.user_id = ?)
        GROUP BY r.id
        ORDER BY r.is_template DESC, r.id ASC`,
      [premium ? 1 : 0, req.user.userId]
    );

    const [favs] = await pool.query('SELECT routine_id FROM user_routines WHERE user_id = ?', [req.user.userId]);
    const favSet = new Set(favs.map((f) => f.routine_id));

    res.json({
      routines: rows.map((r) => ({ ...r, is_favorite: favSet.has(r.id) })),
      premium,
    });
  })
);

// GET /api/routines/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [r] = await pool.query('SELECT * FROM routines WHERE id = ? LIMIT 1', [id]);
    if (!r.length) throw new HttpError(404, 'Rutina no encontrada');
    const routine = r[0];

    // Acceso: no premium no ve rutinas premium; las personalizadas solo a su dueño
    if (routine.is_premium || !routine.is_template) {
      const [userRows] = await pool.query('SELECT premium FROM users WHERE id = ? LIMIT 1', [req.user.userId]);
      const premium = !!(userRows[0] && userRows[0].premium);
      if (!routine.is_template && routine.user_id !== req.user.userId) {
        throw new HttpError(404, 'Rutina no encontrada');
      }
      if (routine.is_premium && !premium) {
        throw new HttpError(403, 'Esta rutina es exclusiva para usuarios Premium');
      }
    }

    const [exercises] = await pool.query(
      `SELECT re.id AS routine_exercise_id, re.position, re.sets, re.repetitions,
              re.duration_seconds, re.rest_seconds, re.weight_kg,
              e.id AS exercise_id, e.name, e.description, e.muscle_group,
              e.difficulty, e.is_time_based, e.sensor_type
         FROM routine_exercises re
         JOIN exercises e ON e.id = re.exercise_id
        WHERE re.routine_id = ?
        ORDER BY re.position ASC`,
      [id]
    );
    res.json({ routine, exercises });
  })
);

// POST /api/routines (Premium) — crear rutina personalizada
router.post(
  '/',
  requirePremium,
  asyncHandler(async (req, res) => {
    const parsed = createRoutineSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    const data = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO routines (user_id, name, description, level, is_premium, is_template, estimated_minutes)
         VALUES (?, ?, ?, ?, 1, 0, ?)`,
        [req.user.userId, data.name, data.description, data.level, data.exercises.length * 4]
      );
      const routineId = ins.insertId;

      for (const [i, ex] of data.exercises.entries()) {
        await conn.query(
          `INSERT INTO routine_exercises
            (routine_id, exercise_id, position, sets, repetitions, duration_seconds, rest_seconds, weight_kg)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            routineId,
            ex.exercise_id,
            ex.position ?? i + 1,
            ex.sets,
            ex.repetitions ?? null,
            ex.duration_seconds ?? null,
            ex.rest_seconds,
            ex.weight_kg ?? null,
          ]
        );
      }
      await conn.commit();
      res.status(201).json({ id: routineId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// POST /api/routines/:id/favorite
router.post(
  '/:id/favorite',
  asyncHandler(async (req, res) => {
    await pool.query('INSERT IGNORE INTO user_routines (user_id, routine_id) VALUES (?, ?)', [
      req.user.userId,
      Number(req.params.id),
    ]);
    res.json({ ok: true });
  })
);

// DELETE /api/routines/:id/favorite
router.delete(
  '/:id/favorite',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM user_routines WHERE user_id = ? AND routine_id = ?', [
      req.user.userId,
      Number(req.params.id),
    ]);
    res.json({ ok: true });
  })
);

module.exports = router;