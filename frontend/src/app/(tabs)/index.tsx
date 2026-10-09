/**
 * Inicio: resumen de la semana, racha, rutina del día y accesos rápidos.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TitleStyles } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';

type Goal = {
  id: number;
  type: string;
  title: string;
  target: number;
  current: number;
  unit: string;
};

type Dashboard = {
  user: { name: string; premium: boolean; goal: string | null; level: string };
  week: { workoutsCompleted: number; workoutsTarget: number; minutesThisWeek: number; percent: number };
  streak: number;
  todayRoutine: { id: number; name: string; description: string | null; level: string; estimated_minutes: number | null } | null;
  goals: Goal[];
  lastWorkouts: { id: number; name: string; activity_type: string; started_at: string }[];
};

export default function HomeScreen() {
  const theme = useTheme();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<Dashboard>('/users/me/dashboard');
      setDash(res);
      // Contador de notificaciones sin leer (no bloquea el dashboard)
      api
        .get<{ unread: number }>('/notifications/history?limit=1')
        .then((n) => setUnread(n.unread ?? 0))
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar tu progreso');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startRoutine = async () => {
    if (!dash?.todayRoutine) return;
    try {
      const res = await api.post<{ id: number }>('/workouts', {
        routine_id: dash.todayRoutine.id,
        name: dash.todayRoutine.name,
      });
      router.push({ pathname: '/workout/[id]', params: { id: String(res.id) } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la rutina');
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  const weekPercent = `${dash?.week.percent ?? 0}%` as `${number}%`;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText style={TitleStyles.screenTitle}>FITTRACK</ThemedText>
          <Pressable
            onPress={() => router.push('/notifications')}
            style={[styles.bell, { backgroundColor: theme.backgroundElement }]}
            accessibilityLabel="Centro de notificaciones">
            <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={22} color={theme.primaryDark} />
            {unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                <ThemedText style={styles.badgeText}>{unread > 9 ? '9+' : String(unread)}</ThemedText>
              </View>
            ) : null}
          </Pressable>
        </View>
        <ThemedText type="subtitle">¡Hola, {dash?.user.name ?? 'atleta'}!</ThemedText>

        {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Tu progreso esta semana</ThemedText>
          <Divider />
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { width: weekPercent, backgroundColor: theme.primary }]} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {dash?.week.workoutsCompleted ?? 0} / {dash?.week.workoutsTarget ?? 3} entrenamientos ·{' '}
            {dash?.week.minutesThisWeek ?? 0} min
          </ThemedText>
          <ThemedText style={styles.streak}>🔥 Racha: {dash?.streak ?? 0} días</ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Entrenamiento de hoy</ThemedText>
          <Divider />
          {dash?.todayRoutine ? (
            <>
              <ThemedText type="subtitle">{dash.todayRoutine.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {dash.todayRoutine.level} · {dash.todayRoutine.estimated_minutes ?? 0} min estimados
              </ThemedText>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
                onPress={startRoutine}>
                <ThemedText style={styles.primaryButtonText}>COMENZAR</ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Elige una rutina en la pestaña Rutinas 🏋️
            </ThemedText>
          )}
        </ThemedView>

        {dash && dash.goals.length > 0 ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Objetivos</ThemedText>
            {dash.goals.slice(0, 3).map((g) => {
              const pct = Math.min(100, Math.round((g.current / g.target) * 100));
              return (
                <View key={g.id} style={styles.goalRow}>
                  <ThemedText type="small" style={styles.goalTitle}>
                    {g.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {Math.round(g.current)}/{Math.round(g.target)} {g.unit} · {pct}%
                  </ThemedText>
                </View>
              );
            })}
          </ThemedView>
        ) : null}

        <ThemedView style={styles.quickRow}>
          <QuickLink icon="navigate" label="Outdoor" onPress={() => router.push('/outdoor')} />
          <QuickLink icon="phone-portrait" label="Sensores" onPress={() => router.push('/sensor')} />
          <QuickLink icon="time" label="Historial" onPress={() => router.push('/history')} />
          <QuickLink icon="star" label="Premium" onPress={() => router.push('/premium')} />
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function QuickLink({
  icon,
  label,
  onPress,
}: {
  icon: 'navigate' | 'phone-portrait' | 'time' | 'star';
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.quick, { backgroundColor: theme.backgroundElement }]}>
      <Ionicons name={icon} size={22} color={theme.primaryDark} />
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  bell: { borderRadius: 0, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  card: { borderRadius: 0, padding: Spacing.three, gap: Spacing.two },
  track: { height: 12, borderRadius: 0, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 0 },
  streak: { color: '#F59E0B', fontWeight: '700', marginTop: Spacing.one },
  primaryButton: {
    borderRadius: 0,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
    alignSelf: 'stretch',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 1 },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  goalTitle: { flex: 1 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  quick: { flexBasis: '47%', flexGrow: 1, borderRadius: 0, padding: Spacing.two, alignItems: 'center', gap: Spacing.one },
});