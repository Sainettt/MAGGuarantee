'use client';

// TanStack Query hook for the Phase 6.4 planista read-only fleet panel.
//
// `GET /fleet/planista` is a read-only aggregate (vehicles the planista plans +
// the drivers/trailers of the owning carriers). Scope is JWT-driven server-side
// so there are no params. We cache for ~5 min — the panel is an inspection
// surface, not a live operations board, so a slightly stale read is fine and
// avoids refiring on every tab switch.

import { useQuery } from '@tanstack/react-query';

import { getPlanistaFleet } from '@/lib/api/fleet';

export const PLANISTA_FLEET_KEY = ['fleet', 'planista'] as const;

interface UsePlanistaFleetOptions {
  /** Gate the query. Defaults to `true` (the panel always wants it). */
  enabled?: boolean;
}

export function usePlanistaFleet(options: UsePlanistaFleetOptions = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: PLANISTA_FLEET_KEY,
    queryFn: getPlanistaFleet,
    enabled,
    staleTime: 5 * 60_000,
  });
}
