/**
 * Entrenamiento al aire libre: GPS (distancia, tiempo, velocidad, ruta)
 * + brújula MAGNETÓMETRO (dirección). Al finalizar guarda todo en la API.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useGPSActivity } from '@/hooks/useGPSActivity';
import { useMagnetometerHeading } from '@/hooks/useMagnetometerHeading';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function OutdoorScreen() {
  const theme = useTheme();
  const gps = useGPSActivity();
  const mag = useMagnetometerHeading();
  const [saving, setSaving] = useState(false);

  const saveRun = async () => {
    gps.stop();
    setSaving(true);
    try {
      const avgSpeed = gps.elapsedSec > 0 ? gps.distanceM / 1000 / (gps.elapsedSec / 3600) : 0;
      const started = new Date(Date.now() - gps.elapsedSec * 1000).toISOString();
      const w = await api.post<{ id: number }>('/workouts', { name: 'Carrera', activity_type: 'run' });
      await api.put(`/workouts/${w.id}/gps`, {
        distance_meters: Math.round(gps.distanceM),
        duration_seconds: gps.elapsedSec,
        avg_speed_kmh: Math.round(avgSpeed * 10) / 10,
        max_speed_kmh: Math.round(gps.maxSpeedKmh * 10) / 10,
        avg_bearing_deg: mag.heading == null ? null : Math.round(mag.heading * 10) / 10,
        bearing_point: mag.point,
        started_at: started,
        ended_at: new Date().toISOString(),
      });
      if (gps.points.length) {
        await api.post(`/workouts/${w.id}/gps/points`, { points: gps.points });
      }
      await api.patch(`/workouts/${w.id}`, { status: 'completed' });
      router.replace('/history');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar la actividad');
    } finally {
      setSaving(false);
    }
  };

  const onStop = () => {
    Alert.alert('Finalizar carrera', '¿Guardar esta actividad al aire libre?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Guardar', onPress: saveRun },
    ]);
  };

  if (gps.permission === false) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="danger">Permiso de ubicación denegado</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Habilita la ubicación para usar el modo outdoor.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <ThemedText themeColor="textSecondary">← Volver</ThemedText>
        </Pressable>
        <ThemedText style={styles.logo}>OUTDOOR</ThemedText>
        <ThemedText type="subtitle">🏃 Carrera</ThemedText>

        <ThemedView type="backgroundElement" style={styles.compassCard}>
          <View style={[styles.compassCircle, { borderColor: theme.primary }]}>
            <ThemedText style={styles.compassPoint}>{mag.point ?? '—'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Rumbo {mag.heading == null ? '—' : `${Math.round(mag.heading)}°`}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Dirección detectada con el magnetómetro 🧭
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.statsCard}>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{formatTime(gps.elapsedSec)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Tiempo</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{(gps.distanceM / 1000).toFixed(2)} km</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Distancia</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{gps.speedKmh.toFixed(1)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">km/h</ThemedText>
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {gps.points.length} puntos de ruta registrados
          </ThemedText>
        </ThemedView>

        {gps.running ? (
          <Pressable
            style={[styles.stopButton, { backgroundColor: '#EF4444' }]}
            onPress={onStop}
            disabled={saving}>
            <ThemedText style={styles.buttonText}>FINALIZAR ENTRENAMIENTO</ThemedText>
          </Pressable>
        ) : (
          <Pressable style={[styles.startButton, { backgroundColor: theme.primary }]} onPress={gps.start}>
            <ThemedText style={styles.buttonText}>▶ INICIAR CARRERA</ThemedText>
          </Pressable>
        )}
        {saving ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            Guardando actividad…
          </ThemedText>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  logo: { fontSize: 22, fontWeight: '800', letterSpacing: 3, color: '#22C55E' },
  backLink: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  compassCard: { borderRadius: 16, padding: Spacing.three, alignItems: 'center', gap: Spacing.two },
  compassCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  compassPoint: { fontSize: 40, fontWeight: '800' },
  statsCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.three },
  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: Spacing.one },
  statValue: { fontSize: 24, fontWeight: '800' },
  startButton: { borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  stopButton: { borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 1 },
  centerText: { textAlign: 'center' },
});