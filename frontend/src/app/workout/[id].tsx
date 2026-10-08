/**
 * Ejecución de un entrenamiento: registra series por ejercicio.
 * Si el ejercicio usa el ACELERÓMETRO, el contador de repeticiones
 * (useRepCounter) sustituye el ingreso manual.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRepCounter } from '@/hooks/useRepCounter';
import { api } from '@/services/api';

type WorkoutExercise = {
  workout_exercise_id: number;
  position: number;
  planned_sets: number;
  planned_repetitions: number | null;
  planned_duration_seconds: number | null;
  completed: boolean;
  exercise_id: number;
  name: string;
  description: string | null;
  is_time_based: boolean;
  sensor_type: 'none' | 'accelerometer' | 'gps';
  sets: {
    id: number;
    set_number: number;
    repetitions: number | null;
    sensor_reps: number | null;
    weight_kg: number | null;
    duration_seconds: number | null;
    completed: boolean;
  }[];
};

type Detail = { workout: { id: number; name: string }; exercises: WorkoutExercise[] };

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const rep = useRepCounter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [repsInput, setRepsInput] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Detail>(`/workouts/${id}`);
      setDetail(res);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cargar el entrenamiento');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const recordSet = async (ex: WorkoutExercise, body: Record<string, unknown>) => {
    setSaving(ex.workout_exercise_id);
    try {
      await api.post(`/workouts/${id}/exercises/${ex.workout_exercise_id}/sets`, body);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar la serie');
    } finally {
      setSaving(null);
    }
  };

  const finish = async (status: 'completed' | 'canceled') => {
    try {
      await api.patch(`/workouts/${id}`, { status });
      router.replace('/history');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo finalizar');
    }
  };

  const onFinish = () => {
    Alert.alert('Finalizar entrenamiento', '¿Terminaste tu rutina?', [
      { text: 'Seguir', style: 'cancel' },
      { text: 'Finalizar', onPress: () => finish('completed') },
    ]);
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  if (!detail) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <ThemedText themeColor="textSecondary">← Volver</ThemedText>
        </Pressable>
        <ThemedText style={styles.logo}>ENTRENAMIENTO</ThemedText>
        <ThemedText type="subtitle">{detail.workout.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          🎯 cuenta: {rep.count} reps (acelerómetro)
        </ThemedText>

        {detail.exercises.map((ex) => (
          <ExerciseRow
            key={ex.workout_exercise_id}
            exercise={ex}
            repCount={rep.count}
            repReset={rep.reset}
            repsInput={repsInput[ex.workout_exercise_id] ?? ''}
            onRepsChange={(v) => setRepsInput((s) => ({ ...s, [ex.workout_exercise_id]: v }))}
            onRecord={(body) => recordSet(ex, body)}
            saving={saving === ex.workout_exercise_id}
          />
        ))}

        <View style={styles.finishRow}>
          <Pressable
            style={[styles.cancelButton, { borderColor: theme.danger }]}
            onPress={() => finish('canceled')}>
            <ThemedText style={{ color: theme.danger, fontWeight: '700' }}>Cancelar</ThemedText>
          </Pressable>
          <Pressable style={[styles.finishButton, { backgroundColor: theme.primary }]} onPress={onFinish}>
            <ThemedText style={styles.finishText}>FINALIZAR</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function ExerciseRow({
  exercise: ex,
  repCount,
  repReset,
  repsInput,
  onRepsChange,
  onRecord,
  saving,
}: {
  exercise: WorkoutExercise;
  repCount: number;
  repReset: () => void;
  repsInput: string;
  onRepsChange: (v: string) => void;
  onRecord: (body: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const theme = useTheme();
  const done = ex.sets.filter((s) => s.completed).length;
  const percent = Math.min(100, Math.round((done / ex.planned_sets) * 100));

  return (
    <ThemedView type="backgroundElement" style={styles.exerciseCard}>
      <ThemedView style={styles.exerciseHeader}>
        <ThemedText type="smallBold" style={styles.exerciseName}>
          {ex.position}. {ex.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {done}/{ex.planned_sets} series
        </ThemedText>
      </ThemedView>

      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${percent}%` as `${number}%`, backgroundColor: theme.primary }]} />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {ex.is_time_based
          ? `${ex.planned_duration_seconds ?? 0} s por serie`
          : `Meta: ${ex.planned_repetitions ?? 0} reps`}
        {ex.sensor_type === 'accelerometer' ? ' · 📱 conteo por sensor' : ''}
      </ThemedText>

      {ex.sensor_type === 'accelerometer' ? (
        <View style={styles.sensorBox}>
          <ThemedText style={styles.sensorCount}>{repCount}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            repeticiones detectadas
          </ThemedText>
          <Pressable
            disabled={saving}
            onPress={() => {
              onRecord({ sensor_reps: repCount, completed: true });
              repReset();
            }}
            style={[styles.recordButton, { backgroundColor: theme.info }]}>
            <ThemedText style={styles.recordText}>REGISTRAR SERIE (sensor)</ThemedText>
          </Pressable>
        </View>
      ) : ex.is_time_based ? (
        <Pressable
          disabled={saving}
          onPress={() => onRecord({ duration_seconds: ex.planned_duration_seconds ?? 30, completed: true })}
          style={[styles.recordButton, { backgroundColor: theme.primary }]}>
          <ThemedText style={styles.recordText}>COMPLETAR SERIE ({ex.planned_duration_seconds ?? 30}s)</ThemedText>
        </Pressable>
      ) : (
        <View style={styles.manualRow}>
          <TextInput
            style={[styles.repsInput, { backgroundColor: theme.background, color: theme.text }]}
            placeholder="Reps"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
            value={repsInput}
            onChangeText={onRepsChange}
          />
          <Pressable
            disabled={saving}
            onPress={() => {
              const reps = Number(repsInput);
              if (!reps) return;
              onRecord({ repetitions: reps, completed: true });
              onRepsChange('');
            }}
            style={[styles.recordButton, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.recordText}>REGISTRAR SERIE</ThemedText>
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  logo: { fontSize: 22, fontWeight: '800', letterSpacing: 3, color: '#22C55E' },
  backLink: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  exerciseCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  exerciseName: { flex: 1, fontSize: 17 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  sensorBox: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.two },
  sensorCount: { fontSize: 56, fontWeight: '800', color: '#22C55E' },
  recordButton: { borderRadius: 10, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, alignItems: 'center', flexShrink: 1 },
  recordText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  manualRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  repsInput: { borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, minWidth: 72, fontSize: 15, textAlign: 'center' },
  finishRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  cancelButton: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: Spacing.three, alignItems: 'center' },
  finishButton: { flex: 2, borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  finishText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 1 },
});