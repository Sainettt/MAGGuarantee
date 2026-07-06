'use client';

// TanStack Query hooks for /claims (carrier panel — Phase 3,
// employee verification — Phase 4 sub-slice 4.1).
//
// The preview hook is debounced on the *consumer* side: callers pass a
// `body` that is already debounced (we use `useDebouncedValue` in the
// new-claim form and in the employee verification modal) so this hook
// itself stays a plain `useQuery`. Cache keying on the body lets repeat
// keystrokes hit the cache.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  ClaimDto,
  ClaimFilters,
  PreviewClaimDto,
  PreviewClaimResponse,
  RequestAuthorizationDto,
  SetAuthorizationAmountDto,
  SubmitClaimDto,
  SubmitReklamacjaDto,
  UpdateClaimDto,
} from '@magguarantee/shared';

import {
  getClaim,
  listClaims,
  previewExistingClaim,
  previewNewClaim,
  requestAuthorization,
  setAuthorizationAmount,
  submitClaim,
  submitReklamacja,
  updateClaim,
} from '@/lib/api/claims';

export const CLAIMS_KEY = ['claims'] as const;

export function useClaims(filters: ClaimFilters = { limit: 50 }) {
  return useQuery({
    queryKey: [...CLAIMS_KEY, 'list', filters],
    queryFn: () => listClaims(filters),
  });
}

export function useClaim(nrZgl: string | null | undefined) {
  return useQuery({
    queryKey: [...CLAIMS_KEY, 'detail', nrZgl],
    queryFn: () => getClaim(nrZgl as string),
    enabled: Boolean(nrZgl),
  });
}

/**
 * Live-preview the km-calc. The component is responsible for debouncing
 * the input — this hook just keys the cache by `body` so identical bodies
 * dedupe and successive distinct bodies still fire (until the server's
 * 30/min rate limit kicks in).
 *
 * `enabled` defaults to `true` but consumers should gate it on a
 * minimal-fields check (`vehicleId && dateStart && dateEnd && mileage`)
 * so we don't fire bogus 422s while the form is half-empty.
 */
export function useClaimPreview(
  body: PreviewClaimDto | null,
  options?: { enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && body !== null;
  return useQuery<PreviewClaimResponse>({
    queryKey: [...CLAIMS_KEY, 'preview', body],
    queryFn: () => previewNewClaim(body as PreviewClaimDto),
    enabled,
    // Don't retry on 422 — invalid input is the user's problem to fix.
    retry: false,
    // Keep the prior preview visible while new keystrokes settle.
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useSubmitClaim(
  opts?: UseMutationOptions<
    ClaimDto,
    Error,
    { body: SubmitClaimDto; idempotencyKey?: string }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }) => submitClaim(body, idempotencyKey),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: CLAIMS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useSubmitReklamacja(
  opts?: UseMutationOptions<
    ClaimDto,
    Error,
    { nrZgl: string; body: SubmitReklamacjaDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nrZgl, body }) => submitReklamacja(nrZgl, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: CLAIMS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

/**
 * Live-preview against an existing claim — used by the employee
 * verification modal's recalc badge. The component is responsible for
 * debouncing the input.
 *
 * `enabled` defaults to `true` but the consumer should gate on the
 * minimal-fields check so we don't fire 422s while the verifier is
 * mid-edit.
 */
export function useClaimPreviewExisting(
  nrZgl: string | null | undefined,
  body: PreviewClaimDto | null,
  options?: { enabled?: boolean },
) {
  const enabled =
    (options?.enabled ?? true) && body !== null && Boolean(nrZgl);
  return useQuery<PreviewClaimResponse>({
    queryKey: [...CLAIMS_KEY, 'preview', nrZgl, body],
    queryFn: () => previewExistingClaim(nrZgl as string, body as PreviewClaimDto),
    enabled,
    retry: false,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

/**
 * `PATCH /claims/:nrZgl` — verifier's decision endpoint. Invalidates
 * both the list and the single-claim cache on success so the table row
 * + open modal both refresh.
 */
export function useUpdateClaim(
  opts?: UseMutationOptions<
    ClaimDto,
    Error,
    { nrZgl: string; body: UpdateClaimDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nrZgl, body }) => updateClaim(nrZgl, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: CLAIMS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

/**
 * `POST /claims/:nrZgl/request-authorization` — Phase 4.2 Maksim handshake.
 *
 * Admin / pracownik flags a claim as needing Maksim sign-off before being
 * booked as accepted. The mutation invalidates the claim detail, list and
 * preview caches on success so the open modal reflects the new
 * `OCZEKUJE_NA_AUTORYZACJE` status + the persisted `amountMaximum` without
 * a manual refetch.
 *
 * The `nrZgl` is bound at hook-call time so the call site stays terse —
 * `mutateAsync(body)` rather than `mutateAsync({ nrZgl, body })`.
 */
export function useRequestAuthorization(
  nrZgl: string,
  opts?: UseMutationOptions<ClaimDto, Error, RequestAuthorizationDto>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RequestAuthorizationDto) =>
      requestAuthorization(nrZgl, body),
    ...opts,
    onSuccess: (...args) => {
      // Detail + list both surface the new status; preview cache is keyed
      // on the body so a stale preview against the old claim row would
      // misrepresent the badge after the request lands.
      qc.invalidateQueries({ queryKey: [...CLAIMS_KEY, 'detail', nrZgl] });
      qc.invalidateQueries({ queryKey: CLAIMS_KEY });
      qc.invalidateQueries({ queryKey: [...CLAIMS_KEY, 'preview', nrZgl] });
      opts?.onSuccess?.(...args);
    },
  });
}

/**
 * `PUT /claims/:nrZgl/authorization-amount` — Phase 4.2 (kwota-Maksima
 * follow-up).
 *
 * Records Maksim's replied amount into `Claim.amountMaximum` while the claim
 * sits in `OCZEKUJE_NA_AUTORYZACJE`. Invalidates the claim detail (so the open
 * modal re-renders with the saved value) and the list. Repeatable — re-saving
 * overwrites the amount. Mirrors `useRequestAuthorization`: `nrZgl` is bound at
 * hook-call time so the call site stays terse — `mutate(body)`.
 */
export function useSetAuthorizationAmount(
  nrZgl: string,
  opts?: UseMutationOptions<ClaimDto, Error, SetAuthorizationAmountDto>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SetAuthorizationAmountDto) =>
      setAuthorizationAmount(nrZgl, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: [...CLAIMS_KEY, 'detail', nrZgl] });
      qc.invalidateQueries({ queryKey: CLAIMS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}
