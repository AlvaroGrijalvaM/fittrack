/**
 * Notificaciones push: token del dispositivo, preferencias, historial y test.
 */
const express = require('express');
const { z } = require('zod');
const pool = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');
const { HttpError } = require('../utils/httpError');
const { authRequired } = require('../middleware/auth');
const pushService = require('../services/push.service');
const cronService = require('../services/cron.service');

const router = express.Router();
router.use(authRequired);

const tokenSchema = z.object({
  expo_push_token: z.string().min(5).max(300),
  platform: z.enum(['android', 'ios', 'web']).nullable().optional(),
});

const boolish = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((v) => v === true || v === 1);

const prefsSchema = z.object({
  push_enabled: boolish.optional(),
  workout_reminders_enabled: boolish.optional(),
  workout_reminder_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  goal_completed_enabled: boolish.optional(),
  streak_enabled: boolish.optional(),
  weekly_summary_enabled: boolish.optional(),
  timezone: z.string().max(64).optional(),
});

// POST /api/notifications/token — registrar el token Expo del dispositivo
router.post(
  '/token',
  asyncHandler(async (req, res) => {
    const parsed = tokenSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Token push inválido');
    const { expo_push_token, platform } = parsed.data;

    await pool.query('UPDATE user_push_tokens SET active = 0 WHERE expo_push_token = ?', [expo_push_token]);
    const [ins] = await pool.query(
      'INSERT INTO user_push_tokens (user_id, expo_push_token, platform) VALUES (?, ?, ?)',
      [req.user.userId, expo_push_token, platform ?? null]
    );
    res.status(201).json({ id: ins.insertId });
  })
);

// GET /api/notifications/preferences
router.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    let [rows] = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1',
      [req.user.userId]
    );
    if (!rows.length) {
      await pool.query('INSERT INTO notification_preferences (user_id) VALUES (?)', [req.user.userId]);
      [rows] = await pool.query(
        'SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1',
        [req.user.userId]
      );
    }
    res.json({ preferences: rows[0] });
  })
);

// PUT /api/notifications/preferences
router.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const parsed = prefsSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Preferencias inválidas');
    const d = parsed.data;

    await pool.query(
      'INSERT INTO notification_preferences (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id',
      [req.user.userId]
    );
    const sets = [];
    const params = [];
    if (d.push_enabled !== undefined) { sets.push('push_enabled = ?'); params.push(d.push_enabled ? 1 : 0); }
    if (d.workout_reminders_enabled !== undefined) { sets.push('workout_reminders_enabled = ?'); params.push(d.workout_reminders_enabled ? 1 : 0); }
    if (d.workout_reminder_time !== undefined) { sets.push('workout_reminder_time = ?'); params.push(d.workout_reminder_time); }
    if (d.goal_completed_enabled !== undefined) { sets.push('goal_completed_enabled = ?'); params.push(d.goal_completed_enabled ? 1 : 0); }
    if (d.streak_enabled !== undefined) { sets.push('streak_enabled = ?'); params.push(d.streak_enabled ? 1 : 0); }
    if (d.weekly_summary_enabled !== undefined) { sets.push('weekly_summary_enabled = ?'); params.push(d.weekly_summary_enabled ? 1 : 0); }
    if (d.timezone !== undefined) { sets.push('timezone = ?'); params.push(d.timezone); }
    if (sets.length) {
      params.push(req.user.userId);
      await pool.query(`UPDATE notification_preferences SET ${sets.join(', ')} WHERE user_id = ?`, params);
    }
    const [rows] = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1',
      [req.user.userId]
    );
    const prefs = rows[0];

    // Si cambió la hora, la zona o se activaron los recordatorios, se reagenda
    // el pendiente con el nuevo horario (zona horaria del usuario).
    const reminderChanged =
      d.workout_reminder_time !== undefined ||
      d.workout_reminders_enabled !== undefined ||
      d.timezone !== undefined;
    if (reminderChanged && prefs) {
      await pool.query(
        `DELETE FROM notifications
          WHERE user_id = ? AND type = 'workout_reminder' AND sent_at IS NULL`,
        [req.user.userId]
      );
      if (prefs.workout_reminders_enabled && prefs.push_enabled) {
        await cronService.createPendingReminder(
          req.user.userId,
          String(prefs.workout_reminder_time || '18:00:00').slice(0, 5),
          prefs.timezone
        );
      }
    }

    res.json({ preferences: prefs });
  })
);

// GET /api/notifications/history — bandeja de notificaciones del usuario
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      [req.user.userId, limit]
    );
    const [cnt] = await pool.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [req.user.userId]
    );
    res.json({ notifications: rows, unread: Number(cnt[0].unread) || 0 });
  })
);

// PATCH /api/notifications/:id/read — marcar una notificación como leída
router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
    const [result] = await pool.query(
      'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?',
      [id, req.user.userId]
    );
    if (!result.affectedRows) throw new HttpError(404, 'Notificación no encontrada');
    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ? LIMIT 1', [id]);
    res.json({ notification: rows[0] });
  })
);

// POST /api/notifications/read-all — marcar todo el historial como leído
router.post(
  '/history/read-all',
  asyncHandler(async (req, res) => {
    const [result] = await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
      [req.user.userId]
    );
    res.json({ updated: result.affectedRows });
  })
);

// POST /api/notifications/test — notificación push de prueba
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    const [tokens] = await pool.query(
      'SELECT expo_push_token FROM user_push_tokens WHERE user_id = ? AND active = 1',
      [req.user.userId]
    );
    const result = await pushService.send(
      tokens.map((t) => t.expo_push_token),
      '¡Hola desde FitTrack! 🔔',
      'Esta es una notificación push de prueba.'
    );
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, sent_at)
       VALUES (?, 'system', 'Prueba de notificación', 'Se envió una notificación de prueba a tu dispositivo.', ?)`,
      [req.user.userId, new Date()]
    );
    res.json(result);
  })
);

module.exports = router;