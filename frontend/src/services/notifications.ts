/**
 * Notificaciones push: registro del token Expo del dispositivo y
 * recordatorio local de respaldo.
 */
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (err) {
    console.warn('No se pudo obtener el token push', err);
    return null;
  }
}

/** Registra el token push del dispositivo en el backend (`user_push_tokens`). */
export async function registerPushToken(): Promise<string | null> {
  const token = await getPushToken();
  if (!token) return null;
  try {
    await api.post('/notifications/token', { expo_push_token: token, platform: Platform.OS });
  } catch (err) {
    console.warn('No se pudo registrar el token push en el backend', err);
  }
  return token;
}

/**
 * Agenda una notificación LOCAL diaria (respaldo del servidor).
 * Nota: en Android el agendado local solo funciona en Development Build;
 * el envío principal se hace desde el backend con expo-server-sdk.
 */
export async function scheduleLocalReminder(time: string): Promise<void> {
  try {
    const [h, m] = time.split(':').map((v) => Number.parseInt(v, 10));
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title: '¡Es hora de entrenar! 🏋️', body: 'Tu rutina de hoy está lista.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: h, minute: m },
    });
  } catch (err) {
    console.warn('No se pudo agendar el recordatorio local', err);
  }
}