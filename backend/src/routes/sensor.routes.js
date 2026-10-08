/**
 * Datos de sensores (acelerómetro, giroscopio y magnetómetro).
 * Solo se guardan resúmenes por ejercicio realizado en exercise_sensor_data.
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const measurementSchema = z.object({
  workout_exercise_id: z.number().int().positive(),
  sensor: z.enum(['accelerometer', 'gyroscope', 'magnetometer']),
  metric: z.string().min(1).max(30),
  value: z.number(),
  unit: z.string().max(15).nullable().optional(),
});

const sensorDataSchema = z.object({
  measurements: z.array(measurementSchema).min(1, 'Agrega al menos una medición'),
});

// POST /api/workouts/:id/sensor-data
router.post(
  '/workouts/:id/sensor-data',
  asyncHandler(async (req, res) => {
    const workoutId = Number(req.params.id);
    const parsed = sensorDataSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join(', '));
    const { measurements } = parsed.data;

    const [w] = await pool.query('SELECT id FROM workouts WHERE id = ? AND user_id = ? LIMIT 1', [
      workoutId,
      req.user.userId,
    ]);
    if (!w.length) throw new HttpError(404, 'Entrenamiento no encontrado');

    // Verificar que los workout_exercise_id pertenezcan a este entrenamiento
    const ids = measurements.map((m) => m.workout_exercise_id);
    const [valid] = await pool.query(
      `SELECT id FROM workout_exercises
        WHERE id IN (?) AND workout_id = ?`,
      [ids, workoutId]
    );
    if (valid.length !== new Set(ids).size) {
      throw new HttpError(400, 'Un ejercicio no pertenece a este entrenamiento');
    }

    let inserted = 0;
    for (const m of measurements) {
      const [res] = await pool.query(
        `INSERT INTO exercise_sensor_data (workout_exercise_id, sensor, metric, value, unit)
         VALUES (?, ?, ?, ?, ?)`,
        [m.workout_exercise_id, m.sensor, m.metric, m.value, m.unit ?? null]
      );
      inserted += res.affectedRows;
    }

    res.status(201).json({ inserted });
  })
);

module.exports = router;