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

/** `GET /fleet/opiekun` — per-carrier vehicle classification + totals. */
export function useOpiekunFleet() {
  return useQuery({
    queryKey: [...OPIEKUN_KEY, 'fleet'],
    queryFn: getOpiekunFleet,
  });
}

/** `GET /opiekun/carriers` — identity + active-child counts only. */
export function useOpiekunCarriers() {
  return useQuery({
    queryKey: [...OPIEKUN_KEY, 'carriers'],
    queryFn: getOpiekunCarriers,
  });
}
