// Typed API wrappers for /api/v1/lookups/*. These back the people-pickers
// (planista, dyspozytor, opiekun). All endpoints are read-only and accessible
// by every authenticated user.

import type {
  LookupTeamListDto,
  LookupUserListDto,
} from '@magguarantee/shared';

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

/**
 * Phase 11 — dispatch teams for the vehicle-form dropdown. Carries each team's
 * dispatcher roster (with a per-dispatcher `active` flag) so the form renders a
 * <TeamMembers> preview without a second round-trip.
 */
export function listTeamLookups(): Promise<LookupTeamListDto> {
  return apiJson<LookupTeamListDto>('/lookups/teams', { method: 'GET' });
}
