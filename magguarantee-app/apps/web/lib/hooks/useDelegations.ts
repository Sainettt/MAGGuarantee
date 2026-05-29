'use client';

// TanStack Query hooks for /delegations (carrier panel — Phase 3).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CancelDelegationDto,
  DelegationDto,
  DelegationFilters,
  SubmitDelegationDto,
} from '@magguarantee/shared';

import {
  cancelDelegation,
  getDelegation,
  getDelegationEligibility,
  listDelegations,
  submitDelegation,
} from '@/lib/api/delegations';

export const DELEGATIONS_KEY = ['delegations'] as const;

export function useDelegations(filters: DelegationFilters = { limit: 50 }) {
  return useQuery({
    queryKey: [...DELEGATIONS_KEY, 'list', filters],
    queryFn: () => listDelegations(filters),
  });
}

/**
 * `GET /delegations/eligibility` — carrier readiness gate for the new-trip
 * form. Returns `{ canCreate }`. Cached briefly so navigating into the form
 * twice doesn't refire; the form refetches on mount to catch a state change
 * since the last visit.
 */
export function useDelegationEligibility() {
  return useQuery({
    queryKey: [...DELEGATIONS_KEY, 'eligibility'],
    queryFn: getDelegationEligibility,
    staleTime: 30_000,
  });
}

export function useDelegation(id: string | null | undefined) {
  return useQuery({
    queryKey: [...DELEGATIONS_KEY, 'detail', id],
    queryFn: () => getDelegation(id as string),
    enabled: Boolean(id),
  });
}

export function useSubmitDelegation(
  opts?: UseMutationOptions<
    DelegationDto,
    Error,
    { body: SubmitDelegationDto; idempotencyKey?: string }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }) =>
      submitDelegation(body, idempotencyKey),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DELEGATIONS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useCancelDelegation(
  opts?: UseMutationOptions<
    DelegationDto,
    Error,
    { id: string; body?: CancelDelegationDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => cancelDelegation(id, body ?? {}),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DELEGATIONS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}
