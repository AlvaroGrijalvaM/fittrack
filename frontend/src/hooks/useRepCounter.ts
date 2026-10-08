/**
 * Contador de repeticiones con el ACELERÓMETRO.
 * Detecta picos de la magnitud √(x²+y²+z²) sobre una línea base
 * (calibrada automáticamente para quitar la gravedad).
 */
import * as Haptics from 'expo-haptics';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

type Options = {
  /** Delta de magnitud que cuenta como repetición. */
  threshold?: number;
  /** Tiempo mínimo entre repeticiones (ms). */
  minIntervalMs?: number;
  /** Intervalo de muestreo del sensor (ms). */
  sampleMs?: number;
  withHaptics?: boolean;
};

export function useRepCounter(options: Options = {}) {
  const { threshold = 1.7, minIntervalMs = 380, sampleMs = 50, withHaptics = true } = options;
  const [count, setCount] = useState(0);
  const [available, setAvailable] = useState(false);
  const lastPeak = useRef(0);
  const baseline = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let sub: { remove: () => void } | null = null;

    Accelerometer.isAvailableAsync().then((ok) => {
      if (mounted) setAvailable(ok);
    });
    Accelerometer.setUpdateInterval(sampleMs);
    sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (baseline.current == null) {
        baseline.current = magnitude; // incluye la gravedad (~1 g)
        return;
      }
      const now = Date.now();
      const delta = Math.abs(magnitude - baseline.current);
      if (delta > threshold && now - lastPeak.current > minIntervalMs) {
        lastPeak.current = now;
        setCount((c) => c + 1);
        if (withHaptics) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }
      baseline.current += (magnitude - baseline.current) * 0.05; // línea base adaptativa
    });

    return () => {
      mounted = false;
      sub?.remove();
    };
  }, [threshold, minIntervalMs, sampleMs, withHaptics]);

  const reset = () => setCount(0);

  return { count, available, reset };
}