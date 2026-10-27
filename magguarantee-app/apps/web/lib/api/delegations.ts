// Typed API wrappers for /api/v1/delegations/*.

import type {
  CancelDelegationDto,
  DelegationDto,
  DelegationEligibilityResponse,
  DelegationFilters,
  MarkInTransitDto,
  MarkReadyDto,
  MarkReturnedDto,
  SubmitDelegationDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { type Paginated, toQuery } from './query';

/**
 * GET /delegations/eligibility (przewoznik) — a single readiness boolean that
 * mirrors the same server-side check that hard-blocks POST /delegations. No
 * breakdown is exposed to the carrier by design (product decision); the portal
 * uses it only to enable/disable the new-trip CTA.
 */
export function getDelegationEligibility(): Promise<DelegationEligibilityResponse> {
  return apiJson<DelegationEligibilityResponse>('/delegations/eligibility', {
    method: 'GET',
  });
}

export function listDelegations(
  filters: DelegationFilters = { limit: 50 },
): Promise<Paginated<DelegationDto>> {
  return apiJson<Paginated<DelegationDto>>(
    `/delegations${toQuery(filters)}`,
    { method: 'GET' },
  );
}

export function getDelegation(id: string): Promise<DelegationDto> {
  return apiJson<DelegationDto>(`/delegations/${id}`, { method: 'GET' });
}

export function submitDelegation(
  body: SubmitDelegationDto,
  idempotencyKey?: string,
): Promise<DelegationDto> {
  return apiJson<DelegationDto>('/delegations', {
    method: 'POST',
    json: body,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export function cancelDelegation(
  id: string,
  body: CancelDelegationDto = {},
): Promise<DelegationDto> {
  return apiJson<DelegationDto>(`/delegations/${id}/cancel`, {
    method: 'POST',
    json: body,
  });
}

// ─── Status transitions (Phase 7 REWORK 2026-06-20 #4) ───────────────
//
// The delegation lifecycle is operational again (docs/20 §0″, docs/14 §7.10).
// Three POST transition endpoints — `eksport` drives `/ready` (advance +
// rollback), `weryfikator` drives `/in-transit` + `/returned`. The state
// machine is enforced server-side; these are thin typed wrappers.

/**
 * POST /delegations/:id/ready — eksport|admin. `zgloszony → gotowy` by default;
 * pass `{ rollback: true }` to undo `gotowy → zgloszony` (allowed only while the
 * outing has not yet left — i.e. not `w_trasie`; the api enforces it).
 */
export function markDelegationReady(
  id: string,
  body: MarkReadyDto = { rollback: false },
): Promise<DelegationDto> {
  return apiJson<DelegationDto>(`/delegations/${id}/ready`, {
    method: 'POST',
    json: body,
  });
}

/**
 * POST /delegations/:id/in-transit — weryfikator|admin. `gotowy → w_trasie`.
 * `actualDepartureAt` is a wall-clock datetime LABELLED UTC (the weryfikator's
 * typed `HH:mm` + `:00Z`, e.g. `2026-08-01T08:30:00Z` — see
 * `lib/format/datetimeLocal.ts`, docs/19 #16) — the ACTUAL start of the
 * guarantee period, so the server auto-recalcs the linked wniosek. The api
 * re-validates it (not in the future, not before the reported `departureAt`).
 */
export function markDelegationInTransit(
  id: string,
  body: MarkInTransitDto,
): Promise<DelegationDto> {
  return apiJson<DelegationDto>(`/delegations/${id}/in-transit`, {
    method: 'POST',
    json: body,
  });
}

/**
 * POST /delegations/:id/returned — weryfikator|admin. `w_trasie → zjechal`.
 * `actualReturnAt` is a wall-clock datetime LABELLED UTC (same convention as
 * `actualDepartureAt` above). Server-side side effects (`vehicle.lastDroveAt`
 * bump + linked-wniosek auto-recalc) are invisible here.
 */
export function markDelegationReturned(
  id: string,
  body: MarkReturnedDto,
): Promise<DelegationDto> {
  return apiJson<DelegationDto>(`/delegations/${id}/returned`, {
    method: 'POST',
    json: body,
  });
}
