/**
 * Rutinas: listado, favoritos e inicio de entrenamiento.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TitleStyles } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';

type Routine = {
  id: number;
  name: string;
  description: string | null;
  level: string;
  is_premium: boolean;
  is_template: boolean;
  estimated_minutes: number | null;
  exercise_count: number;
  is_favorite: boolean;
};

export default function RoutinesScreen() {
  const theme = useTheme();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [premiumActive, setPremiumActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ routines: Routine[]; premium: boolean }>('/routines');
      setRoutines(res.routines);
      setPremiumActive(res.premium);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las rutinas');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startRoutine = async (r: Routine) => {
    if (r.is_premium && !premiumActive) {
      Alert.alert('Rutina Premium', 'Esta rutina es exclusiva para usuarios Premium. ¿Quieres suscribirte?', [
        { text: 'Después', style: 'cancel' },
        { text: 'Ver Premium', onPress: () => router.push('/premium') },
      ]);
      return;
    }
    try {
      const res = await api.post<{ id: number }>('/workouts', { routine_id: r.id, name: r.name });
      router.push({ pathname: '/workout/[id]', params: { id: String(res.id) } });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo iniciar la rutina');
    }
  };

  const toggleFavorite = async (r: Routine) => {
    try {
      if (r.is_favorite) {
        await api.del(`/routines/${r.id}/favorite`);
      } else {
        await api.post(`/routines/${r.id}/favorite`);
      }
      setRoutines((list) =>
        list.map((item) => (item.id === r.id ? { ...item, is_favorite: !item.is_favorite } : item))
      );
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el favorito');
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={TitleStyles.screenTitle}>RUTINAS</ThemedText>
        <ThemedText type="subtitle">Elige tu entrenamiento</ThemedText>

        {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}

        {routines.map((r) => {
          const locked = r.is_premium && !premiumActive;
          return (
            <ThemedView key={r.id} type="backgroundElement" style={styles.card}>
              <Pressable onPress={() => startRoutine(r)}>
                <ThemedView style={styles.cardHeader}>
                  <ThemedText type="smallBold" style={styles.cardTitle}>
                    {locked ? `${r.name} 🔒` : r.name}
                  </ThemedText>
                  <Pressable onPress={() => toggleFavorite(r)} hitSlop={8}>
                    <Ionicons
                      name={r.is_favorite ? 'star' : 'star-outline'}
                      size={20}
                      color={r.is_favorite ? '#F59E0B' : theme.textSecondary}
                    />
                  </Pressable>
                </ThemedView>
                <Divider />
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {r.description ?? 'Sin descripción'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.exercise_count} ejercicios · {r.estimated_minutes ?? 0} min · {r.level}
                </ThemedText>
              </Pressable>
            </ThemedView>
          );
        })}

        {!premiumActive ? (
          <Pressable onPress={() => router.push('/premium')} style={[styles.premiumCard, { backgroundColor: '#FEF3C7' }]}>
            <ThemedText style={styles.premiumText}>
              ⭐ Desbloquea más rutinas con FitTrack Premium — $79 MXN/mes
            </ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: { borderRadius: 0, padding: Spacing.three, gap: Spacing.one },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, flex: 1 },
  premiumCard: { borderRadius: 0, padding: Spacing.three, alignItems: 'center' },
  premiumText: { color: '#92400E', fontWeight: '700', textAlign: 'center' },
});