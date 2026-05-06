// Typed API wrappers for /api/v1/claims/*.
//
// Phase 3 — carrier UI. Server enforces ownership/role checks; the client
// just passes the carrier-supplied body and trusts the response.

import type {
  ClaimDto,
  ClaimFilters,
  ClaimListItem,
  PreviewClaimDto,
  PreviewClaimResponse,
  SubmitClaimDto,
  SubmitReklamacjaDto,
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
