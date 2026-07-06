// Typed API wrappers for /api/v1/claims/*.
//
// Phase 3 — carrier UI. Server enforces ownership/role checks; the client
// just passes the carrier-supplied body and trusts the response.
// Phase 4 — sub-slice 4.1 adds `updateClaim` (PATCH) for admin/pracownik
// verification.

import type {
  ClaimDto,
  ClaimFilters,
  ClaimListItem,
  PreviewClaimDto,
  PreviewClaimResponse,
  RequestAuthorizationDto,
  SetAuthorizationAmountDto,
  SubmitClaimDto,
  SubmitReklamacjaDto,
  UpdateClaimDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { type Paginated, toQuery } from './query';

export function listClaims(
  filters: ClaimFilters = { limit: 50 },
): Promise<Paginated<ClaimListItem>> {
  return apiJson<Paginated<ClaimListItem>>(
    `/claims${toQuery(filters)}`,
    { method: 'GET' },
  );
}

export function getClaim(nrZgl: string): Promise<ClaimDto> {
  return apiJson<ClaimDto>(`/claims/${encodeURIComponent(nrZgl)}`, {
    method: 'GET',
  });
}

export function submitClaim(
  body: SubmitClaimDto,
  idempotencyKey?: string,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>('/claims', {
    method: 'POST',
    json: body,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

/**
 * Live-preview the km-calc against a draft new-claim form. Server is the
 * single source of truth — the panel renders exactly what comes back.
 *
 * Note: docs/13 lists both `POST /claims/preview` (no nrZgl) and
 * `POST /claims/:nrZgl/preview` (replay against a saved claim). The
 * new-claim form uses the former.
 */
export function previewNewClaim(
  body: PreviewClaimDto,
): Promise<PreviewClaimResponse> {
  return apiJson<PreviewClaimResponse>('/claims/preview', {
    method: 'POST',
    json: body,
  });
}

export function submitReklamacja(
  nrZgl: string,
  body: SubmitReklamacjaDto,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>(
    `/claims/${encodeURIComponent(nrZgl)}/reklamacja`,
    { method: 'POST', json: body },
  );
}

/**
 * Live-preview the km-calc against an existing claim — used by the
 * employee verification modal's recalc badge so the verifier sees how
 * amending mileage / hoursAdjusted would change the doplata before they
 * decide.
 *
 * Per `docs/13-api-design.md:196` the endpoint should be open to any
 * logged-in user. The current backend `@Roles('przewoznik')` is a known
 * gap — see report `## Blockers`.
 */
export function previewExistingClaim(
  nrZgl: string,
  body: PreviewClaimDto,
): Promise<PreviewClaimResponse> {
  return apiJson<PreviewClaimResponse>(
    `/claims/${encodeURIComponent(nrZgl)}/preview`,
    { method: 'POST', json: body },
  );
}

/**
 * `PATCH /claims/:nrZgl` — verifier's decision endpoint (Phase 4, sub-slice
 * 4.1). Body is the discriminated `UpdateClaimSchema` shape; the server
 * translates synthetic `REKLAMACJA_*` literals back into the underlying
 * `ClaimStatus`. Only `admin` and `pracownik` may call this.
 */
export function updateClaim(
  nrZgl: string,
  body: UpdateClaimDto,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>(`/claims/${encodeURIComponent(nrZgl)}`, {
    method: 'PATCH',
    json: body,
  });
}

/**
 * `POST /claims/:nrZgl/request-authorization` — Phase 4.2.
 *
 * Admin / pracownik flags a verified claim as needing Maksim sign-off
 * before being booked as accepted. Server-side:
 *  - transitions the claim into `OCZEKUJE_NA_AUTORYZACJE`,
 *  - mints a fresh `authorizationToken`,
 *  - dispatches an email to Maksim (Mailhog in dev).
 *
 * Body is `RequestAuthorizationSchema` — `comment` ONLY (trimmed, 1..2000
 * chars), the "opis sprawy" shown to Maksim and persisted into
 * `Claim.authorizationDescription`. The request DOES NOT carry an amount:
 * Maksim hasn't decided anything at request time. His replied amount is
 * recorded LATER via `PUT /claims/:nrZgl/authorization-amount`. Returns the
 * updated `ClaimDto` so the modal can refetch and reflect the new status
 * without a second round-trip.
 */
export function requestAuthorization(
  nrZgl: string,
  body: RequestAuthorizationDto,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>(
    `/claims/${encodeURIComponent(nrZgl)}/request-authorization`,
    { method: 'POST', json: body },
  );
}

/**
 * `PUT /claims/:nrZgl/authorization-amount` — Phase 4.2 (kwota-Maksima
 * follow-up).
 *
 * Records the amount Maksim assigned in his EMAIL REPLY, after the fact.
 * Called by admin / pracownik while the claim sits in
 * `OCZEKUJE_NA_AUTORYZACJE`; maps verbatim to `Claim.amountMaximum`. Body is
 * `SetAuthorizationAmountSchema` — `kwotaMaksima` (EUR, positive, multiple of
 * 0.01). Repeatable: re-calling overwrites the value (Maksim revised his
 * reply). No email — a pure amount record. Returns the updated `ClaimDto` so
 * the open modal refreshes with the saved amount; 422 (Polish message) if the
 * claim is no longer pending authorization.
 */
export function setAuthorizationAmount(
  nrZgl: string,
  body: SetAuthorizationAmountDto,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>(
    `/claims/${encodeURIComponent(nrZgl)}/authorization-amount`,
    { method: 'PUT', json: body },
  );
}
