// Typed API wrappers for /api/v1/lookups/*. These back the people-pickers
// (planista, dyspozytor, opiekun) and the cert-types enum echo. All endpoints
// are read-only and accessible by every authenticated user.

import type { LookupUserListDto, CertTypeListDto } from '@magguarantee/shared';

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

export function listCertTypes(): Promise<CertTypeListDto> {
  return apiJson<CertTypeListDto>('/lookups/cert-types', { method: 'GET' });
}
