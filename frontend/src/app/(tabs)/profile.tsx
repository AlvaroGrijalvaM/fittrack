/**
 * Perfil: datos del usuario, preferencias de notificaciones y accesos.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TitleStyles } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';
import { cancelLocalReminder, registerPushToken, scheduleLocalReminder } from '@/services/notifications';

type Preferences = {
  push_enabled: boolean;
  workout_reminders_enabled: boolean;
  workout_reminder_time: string;
  goal_completed_enabled: boolean;
  streak_enabled: boolean;
  weekly_summary_enabled: boolean;
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPrefs = async () => {
    try {
      const res = await api.get<{ preferences: Preferences }>('/notifications/preferences');
      setPrefs(res.preferences);
    } catch {
      // sin conexión al backend se muestran los valores por defecto
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      loadPrefs();
      registerPushToken();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const updatePrefs = async (patch: Partial<Preferences>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      await api.put<{ preferences: Preferences }>('/notifications/preferences', next);
      if (next.workout_reminders_enabled) {
        scheduleLocalReminder(next.workout_reminder_time).catch(() => {});
      } else {
        cancelLocalReminder().catch(() => {});
      }
    } catch {
      Alert.alert('Error', 'No se pudo guardar la preferencia');
      loadPrefs();
    } finally {
      setSaving(false);
    }
  };

  const onLogout = () => {
    Alert.alert('Cerrar sesión', '¿Salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={TitleStyles.screenTitle}>PERFIL</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedView style={styles.userRow}>
            <Ionicons name="person-circle" size={48} color={theme.primary} />
            <ThemedView style={styles.userInfo}>
              <ThemedText type="smallBold">{user?.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user?.email}
              </ThemedText>
            </ThemedView>
          </ThemedView>
          <Divider />
          <ThemedText type="small" themeColor="textSecondary">
            Nivel: {user?.level ?? '-'} · Meta: {user?.workouts_per_week ?? 3} días/semana
          </ThemedText>
          <ThemedText style={styles.badge}>
            {user?.premium ? '⭐ PREMIUM' : 'Plan gratuito'}
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Notificaciones</ThemedText>
          <Divider />
          <ThemedView style={[styles.row, { borderBottomColor: theme.backgroundSelected }]}>
            <ThemedText type="small">Notificaciones push</ThemedText>
            <Switch
              value={prefs?.push_enabled ?? true}
              onValueChange={(v) => updatePrefs({ push_enabled: v })}
              trackColor={{ true: theme.primary }}
              disabled={saving}
            />
          </ThemedView>
          <ThemedView style={[styles.row, { borderBottomColor: theme.backgroundSelected }]}>
            <ThemedText type="small">Recordatorio de entrenamiento</ThemedText>
            <Switch
              value={prefs?.workout_reminders_enabled ?? true}
              onValueChange={(v) => updatePrefs({ workout_reminders_enabled: v })}
              trackColor={{ true: theme.primary }}
              disabled={saving}
            />
          </ThemedView>
          <ThemedView style={[styles.row, { borderBottomColor: theme.backgroundSelected }]}>
            <ThemedText type="small">Hora del recordatorio</ThemedText>
            <TextInput
              style={[styles.timeInput, { backgroundColor: theme.background, color: theme.text }]}
              value={prefs?.workout_reminder_time?.slice(0, 5) ?? '18:00'}
              onChangeText={(v) => {
                if (/^\d{1,2}:\d{0,2}$/.test(v) && v.length <= 5) {
                  setPrefs((p) => (p ? { ...p, workout_reminder_time: v } : p));
                  if (v.length === 5 && v.charAt(2) === ':') {
                    updatePrefs({ workout_reminder_time: `${v}:00` });
                  }
                }
              }}
              placeholder="HH:MM"
              placeholderTextColor={theme.textSecondary}
            />
          </ThemedView>
          <ThemedText type="smallBold">Tipos de notificación</ThemedText>
          <ThemedView style={[styles.row, { borderBottomColor: theme.backgroundSelected }]}>
            <ThemedText type="small">Metas completadas</ThemedText>
            <Switch
              value={prefs?.goal_completed_enabled ?? true}
              onValueChange={(v) => updatePrefs({ goal_completed_enabled: v })}
              trackColor={{ false: theme.backgroundSelected, true: theme.primary }}
              thumbColor={theme.background}
            />
          </ThemedView>
          <ThemedView style={[styles.row, { borderBottomColor: theme.backgroundSelected }]}>
            <ThemedText type="small">Rachas de entrenamiento</ThemedText>
            <Switch
              value={prefs?.streak_enabled ?? true}
              onValueChange={(v) => updatePrefs({ streak_enabled: v })}
              trackColor={{ false: theme.backgroundSelected, true: theme.primary }}
              thumbColor={theme.background}
            />
          </ThemedView>
          <ThemedView style={[styles.row, { borderBottomColor: theme.backgroundSelected }]}>
            <ThemedText type="small">Resumen semanal</ThemedText>
            <Switch
              value={prefs?.weekly_summary_enabled ?? false}
              onValueChange={(v) => updatePrefs({ weekly_summary_enabled: v })}
              trackColor={{ false: theme.backgroundSelected, true: theme.primary }}
              thumbColor={theme.background}
            />
          </ThemedView>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <MenuLink label="Centro de notificaciones" onPress={() => router.push('/notifications')} />
          <MenuLink label="Historial de entrenamientos" onPress={() => router.push('/history')} />
          <MenuLink label="Demo de sensores (acelerómetro, giroscopio, brújula)" onPress={() => router.push('/sensor')} />
          <MenuLink label="Entrenamiento al aire libre (GPS)" onPress={() => router.push('/outdoor')} />
          <MenuLink label="FitTrack Premium" onPress={() => router.push('/premium')} />
        </ThemedView>

        <Pressable style={[styles.logoutButton, { borderColor: theme.danger }]} onPress={onLogout}>
          <ThemedText style={{ color: theme.danger, fontWeight: '700' }}>Cerrar sesión</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function MenuLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.backgroundSelected }}>
      <ThemedView style={styles.row}>
        <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { borderRadius: 0, padding: Spacing.three, gap: Spacing.two },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  userInfo: { flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    fontWeight: '700',
    color: '#92400E',
    backgroundColor: '#FEF3C7',
  },
  timeInput: {
    borderRadius: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    minWidth: 72,
    textAlign: 'center',
  },
  logoutButton: { borderRadius: 0, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.one },
});