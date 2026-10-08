/**
 * Actividades al aire libre (GPS) y rutas, incluyendo el rumbo del
 * magnetómetro (brújula).
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const gpsSummarySchema = z.object({
  distance_meters: z.number().nonnegative().optional(),
  duration_seconds: z.number().int().min(0).optional(),
  avg_speed_kmh: z.number().nonnegative().optional(),
  max_speed_kmh: z.number().nonnegative().optional(),
  elevation_gain_m: z.number().optional(),
  avg_bearing_deg: z.number().min(0).max(360).nullable().optional(),
  bearing_point: z.string().max(5).nullable().optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
});

const gpsPointsSchema = z.object({
  points: z
    .array(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        altitude_m: z.number().nullable().optional(),
        speed_kmh: z.number().nonnegative().nullable().optional(),
        recorded_at: z.string().datetime().optional(),
      })
    )
    .min(1, 'Agrega al menos un punto'),
});

async function assertOwnWorkout(req, workoutId) {
  const [w] = await pool.query('SELECT id FROM workouts WHERE id = ? AND user_id = ? LIMIT 1', [
    workoutId,
    req.user.userId,
  ]);
  if (!w.length) throw new HttpError(404, 'Entrenamiento no encontrado');
}

// PUT /api/workouts/:workoutId/gps — guardar/actualizar el resumen de la actividad
router.put(
  '/workouts/:workoutId/gps',
  authRequired,
  asyncHandler(async (req, res) => {
    const workoutId = Number(req.params.workoutId);
    const parsed = gpsSummarySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Datos GPS inválidos');
    const d = parsed.data;

    await assertOwnWorkout(req, workoutId);

    const startedAt = d.started_at ? new Date(d.started_at) : new Date();
    const endedAt = d.ended_at ? new Date(d.ended_at) : new Date();

    await pool.query(
      `INSERT INTO outdoor_activities
        (workout_id, user_id, started_at, ended_at, distance_meters, duration_seconds,
         avg_speed_kmh, max_speed_kmh, elevation_gain_m, avg_bearing_deg, bearing_point)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         started_at = VALUES(started_at),
         ended_at = VALUES(ended_at),
         distance_meters = COALESCE(VALUES(distance_meters), distance_meters),
         duration_seconds = COALESCE(VALUES(duration_seconds), duration_seconds),
         avg_speed_kmh = COALESCE(VALUES(avg_speed_kmh), avg_speed_kmh),
         max_speed_kmh = COALESCE(VALUES(max_speed_kmh), max_speed_kmh),
         elevation_gain_m = COALESCE(VALUES(elevation_gain_m), elevation_gain_m),
         avg_bearing_deg = COALESCE(VALUES(avg_bearing_deg), avg_bearing_deg),
         bearing_point = COALESCE(VALUES(bearing_point), bearing_point)`,
      [
        workoutId,
        req.user.userId,
        startedAt,
        endedAt,
        d.distance_meters ?? null,
        d.duration_seconds ?? null,
        d.avg_speed_kmh ?? null,
        d.max_speed_kmh ?? null,
        d.elevation_gain_m ?? null,
        d.avg_bearing_deg ?? null,
        d.bearing_point ?? null,
      ]
    );

    const [gps] = await pool.query('SELECT * FROM outdoor_activities WHERE workout_id = ? LIMIT 1', [workoutId]);
    res.json({ gps: gps[0] });
  })
);

// POST /api/workouts/:workoutId/gps/points — guardar la ruta punto por punto
router.post(
  '/workouts/:workoutId/gps/points',
  authRequired,
  asyncHandler(async (req, res) => {
    const workoutId = Number(req.params.workoutId);
    const parsed = gpsPointsSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Datos de la ruta inválidos');
    const { points } = parsed.data;

    await assertOwnWorkout(req, workoutId);

    const [oa] = await pool.query('SELECT id FROM outdoor_activities WHERE workout_id = ? LIMIT 1', [workoutId]);
    if (!oa.length) throw new HttpError(400, 'Primero guarda el resumen GPS de la actividad');

    const activityId = oa[0].id;
    let inserted = 0;
    for (const p of points) {
      const [res] = await pool.query(
        `INSERT INTO gps_route_points (activity_id, latitude, longitude, altitude_m, speed_kmh, recorded_at)
         VALUES (?, ?, ?, ?, ?, IFNULL(?, NOW()))`,
        [
          activityId,
          p.latitude,
          p.longitude,
          p.altitude_m ?? null,
          p.speed_kmh ?? null,
          p.recorded_at ? new Date(p.recorded_at) : null,
        ]
      );
      inserted += res.affectedRows;
    }

    res.status(201).json({ inserted, activityId });
  })
);

// GET /api/outdoor/:id — resumen y ruta de una actividad propia
router.get(
  '/outdoor/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [oa] = await pool.query(
      'SELECT * FROM outdoor_activities WHERE id = ? AND user_id = ? LIMIT 1',
      [id, req.user.userId]
    );
    if (!oa.length) throw new HttpError(404, 'Actividad no encontrada');

    const [points] = await pool.query(
      `SELECT latitude, longitude, altitude_m, speed_kmh, recorded_at
         FROM gps_route_points WHERE activity_id = ?
        ORDER BY recorded_at ASC`,
      [id]
    );
    res.json({ activity: oa[0], points });
  })
);

module.exports = router;