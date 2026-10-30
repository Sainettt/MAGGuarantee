'use client';

// `matchMedia` as React state. Returns `null` on the server and during
// hydration — the caller must treat "unknown" as its own case (the limits page
// renders the docked panel then, and opens its <Sheet> only once the query is
// known to be `false`, so the modal never flashes open on a desktop).

import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}
