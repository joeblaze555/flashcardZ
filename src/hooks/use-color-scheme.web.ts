import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    // Deferred to a callback (not sync in the effect body) so hydration
    // doesn't cascade-render and satisfies the set-state-in-effect rule.
    const id = requestAnimationFrame(() => setHasHydrated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
