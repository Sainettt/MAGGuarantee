'use client';

// Simple debounce hook — returns the latest value after `delay` ms of
// no further updates. Used by the carrier new-claim form to throttle
// the live `/claims/preview` calls.

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
