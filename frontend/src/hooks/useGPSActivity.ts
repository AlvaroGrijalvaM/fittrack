/**
 * Actividad GPS: permiso, distancia (haversine), velocidad y ruta de puntos
 * para el modo de entrenamiento al aire libre.
 */
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

export type GPSPoint = {
  latitude: number;
  longitude: number;
  altitude_m: number | null;
  speed_kmh: number | null;
  recorded_at: string;
};

type Coords = { latitude: number; longitude: number };

function haversine(a: Coords, b: Coords): number {
  const R = 6371000; // radio de la Tierra en metros
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useGPSActivity() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<GPSPoint[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState(0);
  const lastCoords = useRef<Coords | null>(null);
  const startedRef = useRef(0);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setPermission(true);
      } else {
        setPermission(false);
      }
    })();
    return () => {
      subRef.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = async () => {
    if (permission !== true) return;
    setPoints([]);
    setDistanceM(0);
    setElapsedSec(0);
    setSpeedKmh(0);
    setMaxSpeedKmh(0);
    lastCoords.current = null;
    startedRef.current = Date.now();
    setRunning(true);

    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3 },
      (loc) => {
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        const prev = lastCoords.current;
        lastCoords.current = coords;
        const kmh = (loc.coords.speed ?? 0) * 3.6;
        setMaxSpeedKmh((m) => Math.max(m, kmh));
        setSpeedKmh(kmh);
        setDistanceM((d) => d + (prev ? haversine(prev, coords) : 0));
        setPoints((p) => [
          ...p,
          {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude_m: loc.coords.altitude ?? null,
            speed_kmh: kmh,
            recorded_at: new Date().toISOString(),
          },
        ]);
      }
    );

    timerRef.current = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - startedRef.current) / 1000));
    }, 1000);
  };

  const stop = () => {
    setRunning(false);
    subRef.current?.remove();
    subRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  return {
    permission,
    running,
    start,
    stop,
    points,
    distanceM,
    elapsedSec,
    speedKmh,
    maxSpeedKmh,
  };
}