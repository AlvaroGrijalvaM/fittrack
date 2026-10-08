/**
 * Entrenamientos (workouts): iniciar, registrar series, agregar ejercicios,
 * finalizar (actualiza daily_activity, goals y racha) e historial.
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
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

/** Recalcula el progreso de los objetivos del usuario y marca los completados. */
async function refreshGoals(conn, userId) {
  const since = fmt(getMonday(new Date()));
  const [aggRows] = await conn.query(
    `SELECT COALESCE(SUM(workouts_count), 0) AS workouts,
            COALESCE(SUM(total_minutes), 0) AS minutes,
            COALESCE(SUM(total_distance_m), 0) AS distance
       FROM daily_activity
      WHERE user_id = ? AND activity_date >= ?`,
    [userId, since]
  );
  const agg = aggRows[0];

  const [goals] = await conn.query('SELECT * FROM goals WHERE user_id = ? AND completed = 0', [userId]);
  const completedNow = [];
  for (const goal of goals) {
    let current = goal.current;
    if (goal.type === 'weekly_workouts') current = agg.workouts;
    else if (goal.type === 'weekly_minutes') current = agg.minutes;
    else if (goal.type === 'weekly_distance') current = agg.distance;

    await conn.query('UPDATE goals SET current = ? WHERE id = ?', [current, goal.id]);
    if (!goal.completed && current >= goal.target) {
      await conn.query('UPDATE goals SET completed = 1, completed_at = NOW() WHERE id = ?', [goal.id]);
      completedNow.push({ id: goal.id, title: goal.title, type: goal.type });
    }
  }
  return completedNow;
}

const startSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  routine_id: z.number().int().positive().nullable().optional(),
  activity_type: z.enum(['gym', 'run', 'cycling', 'walk']).optional().default('gym'),
});

const setSchema = z.object({
  set_number: z.number().int().positive().optional(),
  repetitions: z.number().int().min(0).nullable().optional(),
  sensor_reps: z.number().int().min(0).nullable().optional(),
  weight_kg: z.number().nonnegative().nullable().optional(),
  duration_seconds: z.number().int().min(0).nullable().optional(),
  completed: z.boolean().optional().default(true),
});

const addExerciseSchema = z.object({
  exercise_id: z.number().int().positive(),
  position: z.number().int().positive().optional(),
  planned_sets: z.number().int().positive().optional().default(3),
  planned_repetitions: z.number().int().positive().nullable().optional(),
  planned_duration_seconds: z.number().int().positive().nullable().optional(),
});

const finishSchema = z.object({
  status: z.enum(['completed', 'canceled']).optional().default('completed'),
  ended_at: z.string().datetime().optional(),
  calories: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// POST /api/workouts — iniciar entrenamiento
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Datos del entrenamiento inválidos');
    const data = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO workouts (user_id, routine_id, name, activity_type, status)
         VALUES (?, ?, ?, ?, 'in_progress')`,
        [req.user.userId, data.routine_id ?? null, data.name || 'Entrenamiento', data.activity_type]
      );
      const workoutId = ins.insertId;

      if (data.routine_id) {
        const [items] = await conn.query(
          `SELECT exercise_id, position, sets, repetitions, duration_seconds
             FROM routine_exercises WHERE routine_id = ? ORDER BY position ASC`,
          [data.routine_id]
        );
        for (const it of items) {
          await conn.query(
            `INSERT INTO workout_exercises
              (workout_id, exercise_id, position, planned_sets, planned_repetitions, planned_duration_seconds)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [workoutId, it.exercise_id, it.position, it.sets, it.repetitions ?? null, it.duration_seconds ?? null]
          );
        }
      }

      await conn.commit();
      res.status(201).json({ id: workoutId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// GET /api/workouts/history
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [rows] = await pool.query(
      `SELECT id, routine_id, name, activity_type, status, started_at, ended_at,
              duration_seconds, calories
         FROM workouts
        WHERE user_id = ? AND status IN ('completed', 'canceled')
        ORDER BY started_at DESC
        LIMIT ? OFFSET ?`,
      [req.user.userId, limit, offset]
    );
    const [totalRow] = await pool.query(
      `SELECT COUNT(*) AS total FROM workouts WHERE user_id = ? AND status = 'completed'`,
      [req.user.userId]
    );
    res.json({ workouts: rows, total: totalRow[0].total, limit, offset });
  })
);

// GET /api/workouts/:id — detalle con ejercicios, series, GPS y sensores
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [w] = await pool.query('SELECT * FROM workouts WHERE id = ? AND user_id = ? LIMIT 1', [
      id,
      req.user.userId,
    ]);
    if (!w.length) throw new HttpError(404, 'Entrenamiento no encontrado');

    const [exercises] = await pool.query(
      `SELECT we.id AS workout_exercise_id, we.position, we.planned_sets,
              we.planned_repetitions, we.planned_duration_seconds, we.completed, we.completed_at,
              e.id AS exercise_id, e.name, e.description, e.muscle_group,
              e.difficulty, e.is_time_based, e.sensor_type
         FROM workout_exercises we
         JOIN exercises e ON e.id = we.exercise_id
        WHERE we.workout_id = ?
        ORDER BY we.position ASC`,
      [id]
    );

    const [setsRows] = await pool.query(
      `SELECT ws.id, ws.workout_exercise_id, ws.set_number, ws.repetitions,
              ws.sensor_reps, ws.weight_kg, ws.duration_seconds, ws.completed, ws.completed_at
         FROM workout_sets ws
         JOIN workout_exercises we ON we.id = ws.workout_exercise_id
        WHERE we.workout_id = ?
        ORDER BY ws.workout_exercise_id, ws.set_number`,
      [id]
    );
    const setsByWE = {};
    for (const s of setsRows) {
      if (!setsByWE[s.workout_exercise_id]) setsByWE[s.workout_exercise_id] = [];
      setsByWE[s.workout_exercise_id].push(s);
    }
    for (const ex of exercises) ex.sets = setsByWE[ex.workout_exercise_id] || [];

    const [gps] = await pool.query('SELECT * FROM outdoor_activities WHERE workout_id = ? LIMIT 1', [id]);
    const [sensorData] = await pool.query(
      `SELECT esd.id, esd.workout_exercise_id, esd.sensor, esd.metric, esd.value, esd.unit, esd.measured_at
         FROM exercise_sensor_data esd
         JOIN workout_exercises we ON we.id = esd.workout_exercise_id
        WHERE we.workout_id = ?
        ORDER BY esd.measured_at DESC
        LIMIT 100`,
      [id]
    );

    res.json({ workout: w[0], exercises, gps: gps[0] || null, sensorData });
  })
);

// POST /api/workouts/:id/exercises — agregar ejercicio a un entrenamiento en curso
router.post(
  '/:id/exercises',
  asyncHandler(async (req, res) => {
    const workoutId = Number(req.params.id);
    const parsed = addExerciseSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Datos del ejercicio inválidos');
    const d = parsed.data;

    const [w] = await pool.query('SELECT id FROM workouts WHERE id = ? AND user_id = ? LIMIT 1', [
      workoutId,
      req.user.userId,
    ]);
    if (!w.length) throw new HttpError(404, 'Entrenamiento no encontrado');

    let position = d.position;
    if (position == null) {
      const [maxRow] = await pool.query('SELECT MAX(position) AS m FROM workout_exercises WHERE workout_id = ?', [workoutId]);
      position = (maxRow[0].m || 0) + 1;
    }

    const [ins] = await pool.query(
      `INSERT INTO workout_exercises
        (workout_id, exercise_id, position, planned_sets, planned_repetitions, planned_duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workoutId, d.exercise_id, position, d.planned_sets, d.planned_repetitions ?? null, d.planned_duration_seconds ?? null]
    );
    res.status(201).json({ id: ins.insertId, position });
  })
);

// POST /api/workouts/:id/exercises/:weId/sets — registrar una serie
router.post(
  '/:id/exercises/:weId/sets',
  asyncHandler(async (req, res) => {
    const workoutId = Number(req.params.id);
    const weId = Number(req.params.weId);
    const parsed = setSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Datos de la serie inválidos');
    const data = parsed.data;

    const [we] = await pool.query(
      `SELECT we.id, we.planned_sets
         FROM workout_exercises we
         JOIN workouts w ON w.id = we.workout_id
        WHERE we.id = ? AND we.workout_id = ? AND w.user_id = ?
        LIMIT 1`,
      [weId, workoutId, req.user.userId]
    );
    if (!we.length) throw new HttpError(404, 'Ejercicio del entrenamiento no encontrado');

    let setNumber = data.set_number;
    if (setNumber == null) {
      const [cnt] = await pool.query('SELECT COUNT(*) AS c FROM workout_sets WHERE workout_exercise_id = ?', [weId]);
      setNumber = cnt[0].c + 1;
    }

    const [ins] = await pool.query(
      `INSERT INTO workout_sets
        (workout_exercise_id, set_number, repetitions, sensor_reps, weight_kg, duration_seconds, completed, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        weId,
        setNumber,
        data.repetitions ?? null,
        data.sensor_reps ?? null,
        data.weight_kg ?? null,
        data.duration_seconds ?? null,
        data.completed ? 1 : 0,
      ]
    );

    // Resumen del acelerómetro en la tabla de datos de sensor
    if (data.sensor_reps != null) {
      await pool.query(
        `INSERT INTO exercise_sensor_data (workout_exercise_id, sensor, metric, value, unit)
         VALUES (?, 'accelerometer', 'repetitions', ?, 'reps')`,
        [weId, data.sensor_reps]
      );
    }

    // Marcar el ejercicio completado si ya se hicieron todas las series
    if (data.completed) {
      const [done] = await pool.query(
        'SELECT COUNT(*) AS c FROM workout_sets WHERE workout_exercise_id = ? AND completed = 1',
        [weId]
      );
      if (done[0].c >= we[0].planned_sets) {
        await pool.query('UPDATE workout_exercises SET completed = 1, completed_at = NOW() WHERE id = ?', [weId]);
      }
    }

    res.status(201).json({ id: ins.insertId, set_number: setNumber });
  })
);

// PATCH /api/workouts/:id — finalizar / cancelar
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const parsed = finishSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Datos inválidos al finalizar');
    const data = parsed.data;

    const [w] = await pool.query('SELECT * FROM workouts WHERE id = ? AND user_id = ? LIMIT 1', [
      id,
      req.user.userId,
    ]);
    if (!w.length) throw new HttpError(404, 'Entrenamiento no encontrado');
    const workout = w[0];
    if (workout.status !== 'in_progress') {
      return res.json({ workout });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const endedAt = data.ended_at ? new Date(data.ended_at) : new Date();
      const startedAt = workout.started_at instanceof Date ? workout.started_at : new Date(workout.started_at);
      const durationSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
      const minutes = durationSeconds / 60;

      const MET = { gym: 6, run: 10, cycling: 8, walk: 4 };
      const calories = data.calories ?? Math.round(minutes * (MET[workout.activity_type] || 6));

      let distanceM = 0;
      if (['run', 'cycling', 'walk'].includes(workout.activity_type)) {
        const [gps] = await conn.query('SELECT distance_meters FROM outdoor_activities WHERE workout_id = ? LIMIT 1', [id]);
        if (gps.length) distanceM = gps[0].distance_meters || 0;
      }

      await conn.query(
        `UPDATE workouts
            SET status = ?, ended_at = ?, duration_seconds = ?, calories = ?, notes = COALESCE(?, notes)
          WHERE id = ?`,
        [data.status, endedAt, durationSeconds, calories, data.notes ?? null, id]
      );

      const completedGoals = [];
      if (data.status === 'completed') {
        const today = fmt(new Date());
        await conn.query(
          `INSERT INTO daily_activity
             (user_id, activity_date, workouts_count, total_minutes, total_distance_m, total_calories)
           VALUES (?, ?, 1, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             workouts_count = workouts_count + 1,
             total_minutes = total_minutes + VALUES(total_minutes),
             total_distance_m = total_distance_m + VALUES(total_distance_m),
             total_calories = total_calories + VALUES(total_calories)`,
          [req.user.userId, today, Math.max(1, Math.round(durationSeconds / 60)), distanceM, calories]
        );
        completedGoals.push(...(await refreshGoals(conn, req.user.userId)));
      }

      for (const g of completedGoals) {
        await conn.query(
          `INSERT INTO notifications (user_id, type, title, body, scheduled_for)
           VALUES (?, 'goal_completed', '¡Meta completada! 🎉', ?, NOW())`,
          [req.user.userId, `Completaste tu objetivo: ${g.title}`]
        );
      }

      await conn.commit();
      const [fresh] = await conn.query('SELECT * FROM workouts WHERE id = ? LIMIT 1', [id]);
      res.json({ workout: fresh[0], completedGoals });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

module.exports = router;