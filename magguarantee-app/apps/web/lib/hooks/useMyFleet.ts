'use client';

// TanStack Query hook for /fleet/my (carrier panel — Phase 3). Backs every
// dropdown on the new-claim and new-delegation forms. The fleet rarely
// changes during a session so the staleTime is generous.

import { useQuery } from '@tanstack/react-query';

import { getMyFleet } from '@/lib/api/fleet';

export const MY_FLEET_KEY = ['fleet', 'my'] as const;

export function useMyFleet() {
  return useQuery({
    queryKey: MY_FLEET_KEY,
    queryFn: getMyFleet,
    staleTime: 5 * 60_000,
  });
}
