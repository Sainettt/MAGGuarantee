// Typed API wrappers for /api/v1/delegations/*.

import type {
  CancelDelegationDto,
  DelegationDto,
  DelegationFilters,
  SubmitDelegationDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { type Paginated, toQuery } from './query';

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
