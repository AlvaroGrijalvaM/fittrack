/**
 * Estadísticas: gráfica semanal (L M X J V S D) y resumen general.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TitleStyles } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';

type WeeklyDay = {
  day: string;
  date: string;
  workouts_count: number;
  total_minutes: number;
  total_distance_m: number;
  total_calories: number;
};

type Overview = {
  premium: boolean;
  week: { workouts: number; minutes: number; distance_m: number; calories: number };
  month: { workouts: number; minutes: number } | null;
  totals: { workouts: number; minutes?: number; distance_m?: number; calories?: number };
  streak: number;
};

export default function StatsScreen() {
  const theme = useTheme();
  const [weekly, setWeekly] = useState<WeeklyDay[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, o] = await Promise.all([
        api.get<{ week: WeeklyDay[] }>('/stats/weekly'),
        api.get<Overview>('/stats/overview'),
      ]);
      setWeekly(w.week);
      setOverview(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar estadísticas');
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

  const chartData = weekly.map((d) => ({ value: d.workouts_count, label: d.day }));
  const screenWidth = Dimensions.get('window').width - Spacing.four * 2 - Spacing.three * 2;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={TitleStyles.screenTitle}>STATS</ThemedText>
        <ThemedText type="subtitle">Tu progreso</ThemedText>

        {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">ENTRENAMIENTOS ESTA SEMANA</ThemedText>
          {chartData.length ? (
            <BarChart
              data={chartData}
              barWidth={26}
              spacing={18}
              frontColor={theme.primary}
              xAxisLabelTextStyle={{ color: theme.text }}
              yAxisTextStyle={{ color: theme.textSecondary }}
              noOfSections={4}
              yAxisThickness={0}
              xAxisThickness={0}
              initialSpacing={8}
              hideRules
              barBorderTopLeftRadius={4}
              barBorderTopRightRadius={4}
              width={screenWidth}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Sin datos por ahora.
            </ThemedText>
          )}
        </ThemedView>

        {overview ? (
          <View style={styles.grid}>
            {/* Básicas (plan gratuito) */}
            <StatCard label="Racha actual" value={`${overview.streak} 🔥`} />
            <StatCard label="Entrenamientos / semana" value={String(overview.week.workouts)} />
            <StatCard label="Minutos / semana" value={String(overview.week.minutes)} />
            <StatCard label="Total entrenamientos" value={String(overview.totals.workouts)} />
            {/* Avanzadas (Premium) */}
            {overview.premium && overview.month ? (
              <>
                <StatCard label="Entrenamientos / mes" value={String(overview.month.workouts)} />
                <StatCard label="Distancia total" value={`${((overview.totals.distance_m ?? 0) / 1000).toFixed(2)} km`} />
                <StatCard label="Tiempo total" value={`${Math.round((overview.totals.minutes ?? 0) / 60)} h ${(overview.totals.minutes ?? 0) % 60} m`} />
                <StatCard label="Calorías totales" value={String(overview.totals.calories ?? 0)} />
              </>
            ) : (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.lockedNote}
                onPress={() => router.push('/premium')}>
                🔒 Desbloquea estadísticas avanzadas con Premium ⭐
              </ThemedText>
            )}
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.statCard, { borderColor: theme.backgroundSelected }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
      <Divider />
      <ThemedText type="smallBold">{value}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: { borderRadius: 0, padding: Spacing.three, gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 0,
    padding: Spacing.three,
    gap: Spacing.one,
    borderWidth: 1,
  },
  statLabel: { fontSize: 12 },
  lockedNote: { flexBasis: '100%', textAlign: 'center', paddingVertical: Spacing.two },
});