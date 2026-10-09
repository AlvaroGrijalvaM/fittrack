/**
 * Envío de notificaciones push con expo-server-sdk.
 * Si no hay EXPO_ACCESS_TOKEN configurado o no hay tokens válidos,
 * la entrega se registra como "simulada".
 */
const { Expo } = require('expo-server-sdk');

let expo = null;
try {
  expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });
} catch (err) {
  console.error('[push] no se pudo inicializar expo-server-sdk:', err.message);
  expo = null;
}

async function send(pushTokens, title, body, data = {}) {
  const valid = (pushTokens || []).filter((t) => t && typeof t === 'string' && Expo.isExpoPushToken(t));

  if (!valid.length) {
    return { simulated: true, sent: 0, reason: 'no-tokens' };
  }
  if (!expo) {
    return { simulated: true, sent: valid.length, reason: 'expo-sdk-no-config' };
  }

  const messages = valid.map((to) => ({ to, sound: 'default', title, body, channelId: 'reminders', data })); // channelId: canal de Android
  try {
    const chunks = expo.chunkPushNotifications(messages);
    let tickets = [];
    for (const chunk of chunks) {
      const batch = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...batch);
    }
    return { simulated: false, sent: messages.length, tickets };
  } catch (err) {
    return { simulated: true, sent: 0, error: err.message };
  }
}

module.exports = { send };