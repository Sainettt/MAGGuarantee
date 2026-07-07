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
  MarkInTransitDto,
  MarkReadyDto,
  MarkReturnedDto,
  SubmitDelegationDto,
} from '@magguarantee/shared';

import {
  cancelDelegation,
  getDelegation,
  getDelegationEligibility,
  listDelegations,
  markDelegationInTransit,
  markDelegationReady,
  markDelegationReturned,
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
 * `GET /delegations?claimable=true` (carrier) — Phase 7 REWORK 2026-06-20 #4.
 * The carrier's own outings in {`w_trasie`, `zjechal`} that have no linked
 * wniosek yet — the source for the wyjazd selector in the new-claim form. The
 * api scopes by JWT; `gotowy`/`zgloszony` never appear (not submittable).
 */
export function useClaimableDelegations() {
  return useQuery({
    queryKey: [...DELEGATIONS_KEY, 'claimable'],
    queryFn: () => listDelegations({ claimable: true, limit: 200 }),
    // Re-fetch on mount so a freshly `zjechal`-ed outing shows up without a
    // hard reload; short stale window covers double-entry into the form.
    staleTime: 10_000,
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

// ─── Status transitions (Phase 7 REWORK 2026-06-20 #4, docs/14 §7.10) ──
//
// The delegation lifecycle is operational again. `eksport` drives `/ready`
// (advance `zgloszony→gotowy` + rollback `gotowy→zgloszony`); `weryfikator`
// drives `/in-transit` (`gotowy→w_trasie`) and `/returned` (`w_trasie→zjechal`,
// with a server-side linked-wniosek auto-recalc). Each invalidates the
// delegations cache so every board refetches.

export function useMarkDelegationReady(
  opts?: UseMutationOptions<
    DelegationDto,
    Error,
    { id: string; body?: MarkReadyDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      markDelegationReady(id, body ?? { rollback: false }),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DELEGATIONS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useMarkDelegationInTransit(
  opts?: UseMutationOptions<
    DelegationDto,
    Error,
    { id: string; body: MarkInTransitDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => markDelegationInTransit(id, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DELEGATIONS_KEY });
      // `actualDepartureAt` sets the guarantee-period start, so the api
      // auto-recalcs the linked wniosek — drop the claims cache too so the
      // pracownik surface reflects it (§7.10.4), like `useMarkDelegationReturned`.
      qc.invalidateQueries({ queryKey: ['claims'] });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useMarkDelegationReturned(
  opts?: UseMutationOptions<
    DelegationDto,
    Error,
    { id: string; body: MarkReturnedDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => markDelegationReturned(id, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: DELEGATIONS_KEY });
      // A late `zjechal` may auto-recalc the linked wniosek server-side — drop
      // the claims cache too so the pracownik surface reflects it (§7.10.4).
      qc.invalidateQueries({ queryKey: ['claims'] });
      opts?.onSuccess?.(...args);
    },
  });
}
