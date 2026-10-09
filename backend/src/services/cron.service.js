/**
 * Trabajos agendados (node-cron):
 *  - Cada minuto: envía las notificaciones programadas (scheduled_for <= ahora
 *    con sent_at NULL) y registra el envío. Respeta la preferencia global
 *    (push_enabled) y la del tipo de notificación.
 *  - Cada día a las 00:05: crea el recordatorio de entrenamiento de cada
 *    usuario con recordatorios activos, a su hora local (timezone).
 *  - Los lunes a las 09:00: resumen semanal (weekly_summary_enabled).
 */
const cron = require('node-cron');
const pool = require('../config/db');
const pushService = require('./push.service');
const { safeTz, datePartsInTz, wallTimeToInstant, serverLocalString } = require('../utils/timezone');

/** Columna de preferencias que gobierna cada tipo de notificación. */
const TYPE_FLAGS = {
  workout_reminder: 'workout_reminders_enabled',
  goal_completed: 'goal_completed_enabled',
  streak: 'streak_enabled',
  weekly_summary: 'weekly_summary_enabled',
};

/** mysql2 puede devolver la columna JSON como objeto o como texto. */
function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

async function sendScheduledNotifications() {
  try {
    const [rows] = await pool.query(
      `SELECT n.id, n.user_id, n.type, n.title, n.body, n.metadata
         FROM notifications n
        WHERE n.scheduled_for IS NOT NULL
          AND n.scheduled_for <= NOW()
          AND n.sent_at IS NULL
        LIMIT 50`
    );
    for (const n of rows) {
      const [prefs] = await pool.query(
        `SELECT push_enabled, workout_reminders_enabled, goal_completed_enabled,
                streak_enabled, weekly_summary_enabled
           FROM notification_preferences WHERE user_id = ? LIMIT 1`,
        [n.user_id]
      );
      const p = prefs[0];
      const pushOn = !p || p.push_enabled === 1;
      const flag = TYPE_FLAGS[n.type];
      const typeOn = !flag || !p || p[flag] === 1;

      let result = { simulated: true, sent: 0 };
      if (pushOn && typeOn) {
        const [tokens] = await pool.query(
          'SELECT expo_push_token FROM user_push_tokens WHERE user_id = ? AND active = 1',
          [n.user_id]
        );
        result = await pushService.send(
          tokens.map((t) => t.expo_push_token),
          n.title,
          n.body,
          parseMeta(n.metadata)
        );
      }
      await pool.query('UPDATE notifications SET sent_at = NOW() WHERE id = ? AND sent_at IS NULL', [n.id]);
      if (!result.simulated && result.error) {
        console.error(`[push] error en notificación ${n.id}:`, result.error);
      }
    }
  } catch (err) {
    console.error('[cron] error enviando notificaciones programadas:', err.message);
  }
}

/**
 * Crea (si no hay uno pendiente) el recordatorio para el próximo horario del
 * usuario, calculado en su zona horaria. Devuelve scheduled_for o null.
 */
async function createPendingReminder(userId, time, timezone) {
  const tz = safeTz(timezone);
  const now = new Date();
  const p = datePartsInTz(tz, now);
  const [hh, mm] = String(time || '18:00').split(':').map((v) => Number.parseInt(v, 10));
  const H = Number.isFinite(hh) ? hh : 18;
  const M = Number.isFinite(mm) ? mm : 0;
  let when = wallTimeToInstant(p.y, p.m, p.d, H, M, tz);
  if (when.getTime() <= now.getTime()) {
    // ya pasó hoy → mañana (fecha local del usuario)
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    when = wallTimeToInstant(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), H, M, tz);
  }
  const scheduled = serverLocalString(when);
  const [existing] = await pool.query(
    `SELECT id FROM notifications
      WHERE user_id = ? AND type = 'workout_reminder' AND sent_at IS NULL
      LIMIT 1`,
    [userId]
  );
  if (existing.length) return null;
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, scheduled_for)
     VALUES (?, 'workout_reminder', '¡Es hora de entrenar! 🏋️', 'Tu rutina de hoy está lista.', ?)`,
    [userId, scheduled]
  );
  return scheduled;
}

async function scheduleDailyReminders() {
  try {
    const [users] = await pool.query(
      `SELECT np.user_id, np.workout_reminder_time, np.timezone
         FROM notification_preferences np
        WHERE np.workout_reminders_enabled = 1 AND np.push_enabled = 1`
    );
    for (const u of users) {
      await createPendingReminder(
        u.user_id,
        u.workout_reminder_time ? String(u.workout_reminder_time).slice(0, 5) : '18:00',
        u.timezone
      );
    }
  } catch (err) {
    console.error('[cron] error programando recordatorios:', err.message);
  }
}

/** Rango [lunes..domingo] de la semana pasada en la zona del usuario. */
function previousWeekRange(tz) {
  const p = datePartsInTz(tz, new Date());
  const thisMonday = new Date(Date.UTC(p.y, p.m - 1, p.d - ((p.weekday + 6) % 7)));
  const fmt = (d) => d.toISOString().slice(0, 10);
  return {
    start: fmt(new Date(thisMonday.getTime() - 7 * 86400000)),
    end: fmt(new Date(thisMonday.getTime() - 86400000)),
  };
}

/** Crea el resumen semanal de cada usuario que lo tiene activado (idempotente). */
async function sendWeeklySummaries() {
  try {
    const [users] = await pool.query(
      'SELECT user_id, timezone FROM notification_preferences WHERE weekly_summary_enabled = 1'
    );
    for (const u of users) {
      const { start, end } = previousWeekRange(safeTz(u.timezone));
      const [dup] = await pool.query(
        `SELECT id FROM notifications
          WHERE user_id = ? AND type = 'weekly_summary'
            AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.week_start')) = ?
          LIMIT 1`,
        [u.user_id, start]
      );
      if (dup.length) continue;

      const [agg] = await pool.query(
        `SELECT COALESCE(SUM(workouts_count), 0) AS workouts,
                COALESCE(SUM(total_minutes), 0) AS minutes,
                COALESCE(SUM(total_distance_m), 0) AS distance,
                COALESCE(SUM(total_calories), 0) AS calories
           FROM daily_activity
          WHERE user_id = ? AND activity_date BETWEEN ? AND ?`,
        [u.user_id, start, end]
      );
      const a = agg[0];
      const body =
        Number(a.workouts) > 0
          ? `Del ${start} al ${end}: ${a.workouts} entrenamientos · ${a.minutes} min · ${(Number(a.distance) / 1000).toFixed(1)} km · ${Math.round(a.calories)} kcal.`
          : `Del ${start} al ${end}: sin entrenamientos registrados. ¡Actívate esta semana! 💪`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, scheduled_for, metadata)
         VALUES (?, 'weekly_summary', 'Resumen semanal', ?, NOW(), ?)`,
        [u.user_id, body.slice(0, 500), JSON.stringify({ week_start: start, week_end: end })]
      );
    }
  } catch (err) {
    console.error('[cron] error creando resúmenes semanales:', err.message);
  }
}

/** Expira suscripciones vencidas y corrige users.premium (ejecutar a diario y al arrancar). */
async function expireSubscriptions() {
  try {
    const [expired] = await pool.query(
      `UPDATE subscriptions
          SET status = 'expired'
        WHERE status = 'active'
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()`
    );
    if (expired.affectedRows > 0) {
      await pool.query(
        `UPDATE users u
            SET u.premium = 0
          WHERE u.premium = 1
            AND NOT EXISTS (
                  SELECT 1 FROM subscriptions s
                   WHERE s.user_id = u.id
                     AND s.status = 'active'
                     AND (s.expires_at IS NULL OR s.expires_at > NOW())
                )`
      );
      console.log(`[cron] ${expired.affectedRows} suscripcion(es) expirada(s)`);
    }
  } catch (err) {
    console.error('[cron] error expirando suscripciones:', err.message);
  }
}
function start() {
  cron.schedule('* * * * *', sendScheduledNotifications);
  cron.schedule('5 0 * * *', scheduleDailyReminders);
  cron.schedule('0 0 * * *', expireSubscriptions);
  cron.schedule('0 9 * * 1', sendWeeklySummaries); // lunes 09:00 (hora del servidor)
  expireSubscriptions(); // corrige banderas al arrancar
  scheduleDailyReminders(); // no perder el recordatorio si el server arranca tarde
  console.log('[cron] recordatorios activados.');
}

module.exports = {
  start,
  sendScheduledNotifications,
  scheduleDailyReminders,
  sendWeeklySummaries,
  createPendingReminder,
  expireSubscriptions,
};