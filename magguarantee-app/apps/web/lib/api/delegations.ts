// Typed API wrappers for /api/v1/delegations/*.

import type {
  CancelDelegationDto,
  DelegationDto,
  DelegationEligibilityResponse,
  DelegationFilters,
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

// NOTE (Phase 7 rework 2026-06-12 #3): the weryfikator no longer advances
// delegation status. The former `markInTransit` / `markReturned` wrappers (and
// the `/in-transit` / `/returned` endpoints) were removed; the weryfikator now
// records each vehicle's DAILY km on a weekly board. See `lib/api/vehicles.ts`
// (`setVehicleDailyKm` / `getVehicleKmBoard`) + docs/14 §7.7.
