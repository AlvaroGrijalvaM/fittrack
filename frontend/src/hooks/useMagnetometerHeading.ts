/**
 * Brújula con el magnetómetro: rumbo en grados (atan2(y, x)) y punto
 * cardinal de 16 direcciones (N, NNE, NE...).
 */
import { Magnetometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

const COMPASS_POINTS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

const degToPoint = (deg: number): string => COMPASS_POINTS[Math.round(deg / 22.5) % 16];

export function useMagnetometerHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [available, setAvailable] = useState(false);
  const subRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let mounted = true;
    Magnetometer.isAvailableAsync().then((ok) => {
      if (mounted) setAvailable(ok);
    });
    Magnetometer.setUpdateInterval(200);
    subRef.current = Magnetometer.addListener(({ x, y }) => {
      let deg = Math.atan2(y, x) * (180 / Math.PI);
      if (deg < 0) deg += 360;
      setHeading(deg);
    });
    return () => {
      mounted = false;
      subRef.current?.remove();
    };
  }, []);

  return { heading, point: heading == null ? null : degToPoint(heading), available };
}