'use client';

// TanStack Query hooks for /lookups/*. Cache-friendly: the people lists
// barely change in a session so we set a 5-min staleTime.

import { useQuery } from '@tanstack/react-query';

import {
  listDyspozytorzy,
  listOpiekuni,
  listPlanisci,
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
