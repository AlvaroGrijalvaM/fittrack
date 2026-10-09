/**
 * Demo de los sensores: acelerómetro (contador de repeticiones), giroscopio
 * (calibración de colocación) y magnetómetro (brújula). En los entrenamientos
 * solo se guarda el resumen en `exercise_sensor_data`.
 */
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TitleStyles } from '@/constants/theme';
import { useGyroscopeCalibration, type CalibrationStatus } from '@/hooks/useGyroscopeCalibration';
import { useMagnetometerHeading } from '@/hooks/useMagnetometerHeading';
import { useRepCounter } from '@/hooks/useRepCounter';
import { useTheme } from '@/hooks/use-theme';

function useLiveSensorData() {
  const [accel, setAccel] = useState({ x: 0, y: 0, z: 0 });
  const [gyro, setGyro] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    Accelerometer.setUpdateInterval(150);
    const subA = Accelerometer.addListener((d) => setAccel(d));
    Gyroscope.setUpdateInterval(150);
    const subG = Gyroscope.addListener((d) => setGyro(d));
    return () => {
      subA.remove();
      subG.remove();
    };
  }, []);

  const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
  const rotation = Math.abs(gyro.x) + Math.abs(gyro.y) + Math.abs(gyro.z);
  return { accel, gyro, magnitude, rotation };
}

const STATUS_LABEL: Record<CalibrationStatus, string> = {
  idle: 'Pulsa Calibrar',
  measuring: 'Midiendo… mantén el teléfono quieto',
  stable: '✅ Estable: posición correcta para contar',
  moving: '⚠️ Movimiento detectado: coloca el teléfono',
};

export default function SensorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { magnitude, rotation, accel } = useLiveSensorData();
  const rep = useRepCounter();
  const cal = useGyroscopeCalibration();
  const mag = useMagnetometerHeading();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <ThemedText themeColor="textSecondary">← Volver</ThemedText>
        </Pressable>
        <ThemedText style={TitleStyles.screenTitle}>SENSORES</ThemedText>
        <ThemedText type="subtitle">3 sensores en acción</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Acelerómetro</ThemedText>
          <Divider />
          <ThemedText type="small" themeColor="textSecondary">
            Magnitud √(x²+y²+z²) = {magnitude.toFixed(2)} g · x:{accel.x.toFixed(2)}
          </ThemedText>
          <View style={styles.counterBox}>
            <ThemedText style={styles.counterText}>{rep.count}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              repeticiones detectadas (mueve el teléfono)
            </ThemedText>
          </View>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Giroscopio</ThemedText>
          <Divider />
          <ThemedText type="small" themeColor="textSecondary">
            Rotación combinada = {rotation.toFixed(2)} rad/s
          </ThemedText>
          <Pressable
            onPress={cal.calibrate}
            style={[styles.buttonSmall, { backgroundColor: theme.info }]}>
            <ThemedText style={styles.buttonText}>
              {cal.status === 'measuring' ? 'Midiendo…' : 'Calibrar colocación'}
            </ThemedText>
          </Pressable>
          <ThemedText
            type="small"
            style={{ color: cal.status === 'stable' ? theme.primaryDark : theme.textSecondary }}>
            {STATUS_LABEL[cal.status]}
          </ThemedText>
          {cal.status !== 'idle' ? (
            <ThemedText type="small" themeColor="textSecondary">
              Rotación promedio: {cal.avgRotation.toFixed(2)} rad/s
            </ThemedText>
          ) : null}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Magnetómetro (brújula)</ThemedText>
          <Divider />
          <View style={styles.compassBox}>
            <ThemedText style={styles.compassPoint}>{mag.point ?? '—'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Rumbo: {mag.heading == null ? '—' : `${Math.round(mag.heading)}°`}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Complementa el GPS mostrando hacia dónde te desplazas.
          </ThemedText>
        </ThemedView>

        <Pressable
          onPress={() => router.push('/outdoor')}
          style={[styles.button, { backgroundColor: theme.primary }]}>
          <ThemedText style={styles.buttonText}>CARRERA AL AIRE LIBRE (GPS + BRÚJULA)</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  backLink: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  card: { borderRadius: 0, padding: Spacing.three, gap: Spacing.two },
  counterBox: { alignItems: 'center', paddingVertical: Spacing.two },
  counterText: { fontSize: 52, lineHeight: 64, fontWeight: '800', color: '#22C55E' },
  compassBox: { alignItems: 'center', paddingVertical: Spacing.two },
  compassPoint: { fontSize: 44, lineHeight: 56, fontWeight: '800' },
  button: { borderRadius: 0, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.one },
  buttonSmall: { borderRadius: 0, paddingVertical: Spacing.two, alignItems: 'center', alignSelf: 'flex-start' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.5 },
});