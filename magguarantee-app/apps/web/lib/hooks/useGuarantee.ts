'use client';

// Phase 12 — Guarantee Watchdog query hooks (docs/14 §12).
//
// All three watchdog reads share the `GUARANTEE_KEY` namespace so a single
// invalidation (`qc.invalidateQueries({ queryKey: GUARANTEE_KEY })`) refreshes
// every surface at once — used by the delegation-submit mutation so reporting
// a wyjazd drops the resolved vehicle out of the carrier banner on the next
// refetch (the «live truth» rule, §12.2).
//
// `useMyGuaranteeCompliance` powers the carrier banner + fleet badges;
// `useGuaranteeCompliance` powers the admin/opiekun board; `useGuaranteeEpisodes`
// powers the per-carrier history table. The board/episode queries stay off for
// callers that can't see them (`enabled`) so a carrier-scoped page never fires
// an admin-only endpoint.

import { useQuery } from '@tanstack/react-query';

import {
  getGuaranteeCompliance,
  getGuaranteeEpisodes,
  getMyGuaranteeCompliance,
  type GetGuaranteeEpisodesOptions,
} from '@/lib/api/guarantee';

export const GUARANTEE_KEY = ['guarantee'] as const;

/** `GET /guarantee-compliance/me` — carrier banner + per-vehicle fleet badges. */
export function useMyGuaranteeCompliance(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...GUARANTEE_KEY, 'compliance', 'me'],
    queryFn: getMyGuaranteeCompliance,
    enabled,
    staleTime: 60_000,
  });
}

/** `GET /guarantee-compliance` — admin/opiekun live board (API-scoped). */
export function useGuaranteeCompliance(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...GUARANTEE_KEY, 'compliance', 'board'],
    queryFn: getGuaranteeCompliance,
    enabled,
    staleTime: 60_000,
  });
}

/** `GET /guarantee-episodes` — durable violation archive for a carrier/vehicle. */
export function useGuaranteeEpisodes(
  opts: GetGuaranteeEpisodesOptions = {},
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...GUARANTEE_KEY, 'episodes', opts],
    queryFn: () => getGuaranteeEpisodes(opts),
    enabled,
    staleTime: 60_000,
  });
}
