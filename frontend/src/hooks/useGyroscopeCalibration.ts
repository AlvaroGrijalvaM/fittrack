/**
 * Calibración con el GIROSCOPIO: comprueba que el teléfono está quieto
 * antes de empezar un ejercicio (útil para el conteo con acelerómetro)
 * y mide la rotación promedio durante la prueba.
 */
import { Gyroscope } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

export type CalibrationStatus = 'idle' | 'measuring' | 'stable' | 'moving';

export function useGyroscopeCalibration(durationMs = 1500) {
  const [status, setStatus] = useState<CalibrationStatus>('idle');
  const [avgRotation, setAvgRotation] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const calibrate = () => {
    setStatus('measuring');
    const samples: number[] = [];
    Gyroscope.setUpdateInterval(50);
    const sub = Gyroscope.addListener(({ x, y, z }) => {
      samples.push(Math.abs(x) + Math.abs(y) + Math.abs(z));
    });

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      sub.remove();
      const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 99;
      setAvgRotation(avg);
      setStatus(avg < 0.6 ? 'stable' : 'moving');
    }, durationMs);
  };

  return { status, avgRotation, calibrate };
}