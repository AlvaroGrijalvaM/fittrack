/**
 * Historial de entrenamientos completados.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TitleStyles } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';

type WorkoutItem = {
  id: number;
  name: string;
  activity_type: string;
  status: string;
  started_at: string;
  duration_seconds: number | null;
  calories: number | null;
};

const ACTIVITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  gym: 'barbell',
  run: 'walk',
  cycling: 'bicycle',
  walk: 'footsteps',
};

function formatDate(value: string): string {
  const d = new Date(value.length === 19 ? value.replace(' ', 'T') : value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  return `${m} min`;
}

export default function HistoryScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<WorkoutItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limited, setLimited] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ workouts: WorkoutItem[]; total: number; limited?: boolean }>(
        '/workouts/history?limit=50'
      );
      setItems(res.workouts);
      setTotal(res.total);
      setLimited(res.limited ?? false);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText style={TitleStyles.screenTitle}>HISTORIAL</ThemedText>
            <ThemedText type="subtitle">Tus entrenamientos</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {total} entrenamientos completados
            </ThemedText>
          </View>
        }
        ListEmptyComponent={
          <ThemedView type="backgroundElement" style={styles.empty}>
            <ThemedText themeColor="textSecondary">
              Aún no hay entrenamientos. ¡Empieza hoy! 💪
            </ThemedText>
          </ThemedView>
        }
        ListFooterComponent={
          limited ? (
            <Pressable onPress={() => router.push('/premium')} style={styles.lockedFooter}>
              <ThemedText type="small" themeColor="textSecondary">
                Mostrando los últimos 5 · Historial completo con Premium ⭐
              </ThemedText>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name={ACTIVITY_ICONS[item.activity_type] ?? 'barbell'}
                size={22}
                color={theme.primaryDark}
              />
              <View style={styles.cardInfo}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(item.started_at)}
                </ThemedText>
              </View>
            </View>
            <Divider />
            <View style={styles.cardStats}>
              <ThemedText type="small" themeColor="textSecondary">
                ⏱ {formatDuration(item.duration_seconds)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                🔥 {item.calories ?? 0} kcal
              </ThemedText>
            </View>
          </ThemedView>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  header: { gap: Spacing.one },
  empty: { borderRadius: 0, padding: Spacing.four, alignItems: 'center' },
  card: { borderRadius: 0, padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardInfo: { flex: 1 },
  cardStats: { flexDirection: 'row', justifyContent: 'space-between' },
  lockedFooter: { alignItems: 'center', paddingVertical: Spacing.three },
});