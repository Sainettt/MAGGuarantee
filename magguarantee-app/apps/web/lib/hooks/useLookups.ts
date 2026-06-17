'use client';

// TanStack Query hooks for /lookups/*. Cache-friendly: the people lists
// barely change in a session so we set a 5-min staleTime.

import { useQuery } from '@tanstack/react-query';

import {
  listDyspozytorzy,
  listOpiekuni,
  listPlanisci,
  listTeamLookups,
} from '@/lib/api/lookups';

const STALE = 5 * 60_000;

export function usePlanisci() {
  return useQuery({
    queryKey: ['lookups', 'planisci'],
    queryFn: listPlanisci,
    staleTime: STALE,
  });
}

export function useDyspozytorzy() {
  return useQuery({
    queryKey: ['lookups', 'dyspozytor'],
    queryFn: listDyspozytorzy,
    staleTime: STALE,
  });
}

export function useOpiekuni() {
  return useQuery({
    queryKey: ['lookups', 'opiekuni'],
    queryFn: listOpiekuni,
    staleTime: STALE,
  });
}

// Phase 11 — dispatch-team picker for the vehicle form. The query key matches
// `TEAM_LOOKUPS_KEY` in useTeams.ts so the admin Team-CRUD mutations invalidate
// this dropdown (a new/renamed/(de)activated team appears here immediately).
export function useTeamLookups() {
  return useQuery({
    queryKey: ['lookups', 'teams'],
    queryFn: listTeamLookups,
    staleTime: STALE,
  });
}
