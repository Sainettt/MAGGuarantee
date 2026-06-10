// Typed API wrappers for /api/v1/delegations/*.

import type {
  CancelDelegationDto,
  DelegationDto,
  DelegationEligibilityResponse,
  DelegationFilters,
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

/**
 * POST /delegations/:id/in-transit (weryfikator | admin) — Phase 7.
 * Empty-body transition `zgloszony → w_trasie`. The server stamps
 * `verifiedBy/At` from the JWT + clock; the client sends no payload.
 */
export function markInTransit(id: string): Promise<DelegationDto> {
  return apiJson<DelegationDto>(`/delegations/${id}/in-transit`, {
    method: 'POST',
    json: {},
  });
}

/**
 * POST /delegations/:id/returned (weryfikator | admin) — Phase 7. Transition
 * `w_trasie → zjechal`. `actualReturnAt` is **date-only** (`YYYY-MM-DD`) per
 * the owner decision (2026-06-10); the server mirrors it into
 * `vehicle.lastDroveAt`.
 */
export function markReturned(
  id: string,
  body: MarkReturnedDto,
): Promise<DelegationDto> {
  return apiJson<DelegationDto>(`/delegations/${id}/returned`, {
    method: 'POST',
    json: body,
  });
}
