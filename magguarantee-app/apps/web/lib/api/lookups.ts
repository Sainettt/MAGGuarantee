// Typed API wrappers for /api/v1/lookups/*. These back the people-pickers
// (planista, dyspozytor, opiekun). All endpoints are read-only and accessible
// by every authenticated user.

import type { LookupUserListDto } from '@magguarantee/shared';

import { apiJson } from './client';

export function listPlanisci(): Promise<LookupUserListDto> {
  return apiJson<LookupUserListDto>('/lookups/planisci', { method: 'GET' });
}

export function listDyspozytorzy(): Promise<LookupUserListDto> {
  return apiJson<LookupUserListDto>('/lookups/dyspozytor', { method: 'GET' });
}

export function listOpiekuni(): Promise<LookupUserListDto> {
  return apiJson<LookupUserListDto>('/lookups/opiekuni', { method: 'GET' });
}
