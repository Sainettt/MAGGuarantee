'use client';

// TanStack Query hook for /fleet/my (carrier panel — Phase 3). Backs every
// dropdown on the new-claim and new-delegation forms. The fleet rarely
// changes during a session so the staleTime is generous.
//
// `includeInactive` is opt-in: the new-claim form passes it because a
// wniosek may legitimately reference a vehicle that's now deactivated but
// was active during the past period being claimed. Other consumers (new
// delegation, fleet read-only lists) stick with the active-only default.

import { useQuery } from '@tanstack/react-query';

import { getMyFleet, type GetMyFleetOptions } from '@/lib/api/fleet';

export const MY_FLEET_KEY = ['fleet', 'my'] as const;

export type UseMyFleetOptions = GetMyFleetOptions;

export function useMyFleet(opts: UseMyFleetOptions = {}) {
  const { includeInactive = false } = opts;
  return useQuery({
    queryKey: [...MY_FLEET_KEY, { includeInactive }] as const,
    queryFn: () => getMyFleet({ includeInactive }),
    staleTime: 5 * 60_000,
  });
}
