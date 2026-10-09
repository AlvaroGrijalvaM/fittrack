/**
 * Trabajos agendados (node-cron):
 *  - Cada minuto: envía las notificaciones programadas (scheduled_for <= ahora
 *    con sent_at NULL) y registra el envío.
 *  - Cada día a las 00:05: crea el recordatorio de entrenamiento de cada
 *    usuario con recordatorios activos, a la hora configurada.
 */
const cron = require('node-cron');
const pool = require('../config/db');
const pushService = require('./push.service');

const fmtDate = (d) => d.toISOString().slice(0, 10);

async function sendScheduledNotifications() {
  try {
    const [rows] = await pool.query(
      `SELECT n.id, n.user_id, n.title, n.body, n.metadata
         FROM notifications n
        WHERE n.scheduled_for IS NOT NULL
          AND n.scheduled_for <= NOW()
          AND n.sent_at IS NULL
        LIMIT 50`
    );
    for (const n of rows) {
      const [prefs] = await pool.query(
        'SELECT push_enabled FROM notification_preferences WHERE user_id = ? LIMIT 1',
        [n.user_id]
      );
      const enabled = !prefs.length || prefs[0].push_enabled === 1;

      let result = { simulated: true, sent: 0 };
      if (enabled) {
        const [tokens] = await pool.query(
          'SELECT expo_push_token FROM user_push_tokens WHERE user_id = ? AND active = 1',
          [n.user_id]
        );
        result = await pushService.send(
          tokens.map((t) => t.expo_push_token),
          n.title,
          n.body,
          n.metadata ? JSON.parse(n.metadata) : {}
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

async function scheduleDailyReminders() {
  try {
    const today = fmtDate(new Date());
    const [users] = await pool.query(
      `SELECT np.user_id, np.workout_reminder_time
         FROM notification_preferences np
        WHERE np.workout_reminders_enabled = 1 AND np.push_enabled = 1`
    );
    for (const u of users) {
      const time = u.workout_reminder_time ? String(u.workout_reminder_time).slice(0, 5) : '18:00';
      const [existing] = await pool.query(
        `SELECT id FROM notifications
          WHERE user_id = ? AND type = 'workout_reminder' AND DATE(scheduled_for) = ?
          LIMIT 1`,
        [u.user_id, today]
      );
      if (!existing.length) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, scheduled_for)
           VALUES (?, 'workout_reminder', '¡Es hora de entrenar! 🏋️', 'Tu rutina de hoy está lista.', ?)`,
          [u.user_id, `${today} ${time}:00`]
        );
      }
    }
  } catch (err) {
    console.error('[cron] error programando recordatorios:', err.message);
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
  expireSubscriptions(); // corrige banderas al arrancar
  console.log('[cron] recordatorios activados.');
}

module.exports = { start, sendScheduledNotifications, scheduleDailyReminders, expireSubscriptions };