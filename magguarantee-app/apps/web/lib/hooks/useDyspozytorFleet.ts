'use client';

// TanStack Query hook for the Phase 6.5 dyspozytor read-only fleet panel.
//
// `GET /fleet/dyspozytor` is a read-only aggregate (vehicles the dispatcher
// operates + drivers/trailers of the owning carriers + a KPI `stats` block +
// the `stojaceList` idle-vehicle highlight). Scope is JWT-driven server-side so
// there are no params. Cached for ~5 min — same rationale as the planista
// panel: an inspection surface, not a live board.

import { useQuery } from '@tanstack/react-query';

import { getDyspozytorFleet } from '@/lib/api/fleet';

export const DYSPOZYTOR_FLEET_KEY = ['fleet', 'dyspozytor'] as const;

interface UseDyspozytorFleetOptions {
  /** Gate the query. Defaults to `true` (the panel always wants it). */
  enabled?: boolean;
}

export function useDyspozytorFleet(options: UseDyspozytorFleetOptions = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: DYSPOZYTOR_FLEET_KEY,
    queryFn: getDyspozytorFleet,
    enabled,
    staleTime: 5 * 60_000,
  });
}
