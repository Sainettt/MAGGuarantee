'use client';

// TanStack Query hooks for /lookups/*. Cache-friendly: the people lists
// barely change in a session so we set a 5-min staleTime.

import { useQuery } from '@tanstack/react-query';

import {
  listDyspozytorzy,
  listOpiekuni,
  listPlanisci,
  listPlannerLiders,
  listTeamLookups,
  listTransferTargets,
} from '@/lib/api/lookups';

const STALE = 5 * 60_000;

/** Prefix of every planista picker — an approved transfer invalidates it. */
export const PLANISCI_LOOKUP_KEY = ['lookups', 'planisci'] as const;

export function usePlanisci() {
  return useQuery({
    queryKey: PLANISCI_LOOKUP_KEY,
    queryFn: listPlanisci,
    staleTime: STALE,
  });
}

/**
 * docs/29 U2 — transfer targets for one vehicle (active planisci minus its
 * current planista). Short staleTime: who the current planista is changes
 * with every approved transfer, and a stale list would offer a target the
 * api then refuses (422 PLANNER_TRANSFER_TARGET_INVALID).
 */
export function useTransferTargets(
  vehicleId: string | null | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...PLANISCI_LOOKUP_KEY, 'transfer-targets', vehicleId ?? null],
    queryFn: () => listTransferTargets(vehicleId as string),
    enabled: Boolean(vehicleId) && (opts.enabled ?? true),
    staleTime: 30_000,
  });
}

/** docs/29 U9 — planista leaders for the admin UserSheet «Przełożony (lider)». */
export function usePlannerLiders(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...PLANISCI_LOOKUP_KEY, 'liders'],
    queryFn: listPlannerLiders,
    enabled: opts.enabled ?? true,
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
