'use client';

// TanStack Query hooks for the Phase 5 opiekun surface.
//
// Both endpoints are read-only aggregate views derived from the live carriers/
// vehicles tables. They share the same `OPIEKUN_KEY` namespace so an admin
// mutation that affects either table (vehicle create / deactivate / delete,
// carrier deactivate) can invalidate both lists in one shot if needed.

import { useQuery } from '@tanstack/react-query';

import { getOpiekunCarriers, getOpiekunFleet } from '@/lib/api/opiekun';

export const OPIEKUN_KEY = ['opiekun'] as const;

interface UseOpiekunFleetOptions {
  /**
   * Gate the query. Defaults to `true` (the opieka pages always want it). The
   * sidebar passes `enabled: role === 'opiekun'` so the fleet endpoint isn't
   * fetched for roles that can't see the opieka section. The query key is
   * unchanged, so an enabled instance still shares cache with the opieka list
   * page — no double fetch.
   */
  enabled?: boolean;
}

/** `GET /fleet/opiekun` — per-carrier vehicle classification + totals. */
export function useOpiekunFleet(options: UseOpiekunFleetOptions = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: [...OPIEKUN_KEY, 'fleet'],
    queryFn: getOpiekunFleet,
    enabled,
  });
}

/** `GET /opiekun/carriers` — identity + active-child counts only. */
export function useOpiekunCarriers() {
  return useQuery({
    queryKey: [...OPIEKUN_KEY, 'carriers'],
    queryFn: getOpiekunCarriers,
  });
}
