import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/** En web, esperar a la hidratación para evitar cambios de tema en el SSR. */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setHasHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
