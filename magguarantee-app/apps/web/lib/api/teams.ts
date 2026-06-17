// Phase 11 — Typed API wrappers for /api/v1/teams/* (admin CRUD) and the
// /api/v1/lookups/teams dropdown. A `Team` is a numbered dispatch team
// (code like `1.1.13`) that vehicles are assigned to; every dispatcher in the
// team sees the vehicle. Maintained by `admin`.
//
// `Team` uses an `active` flag (NOT a `deletedAt` soft-delete). Hard-delete is
// guarded server-side — a team referenced by users/vehicles 409s; deactivate
// via the `active=false` toggle instead.

import type {
  CreateTeamDto,
  DeleteWithReasonDto,
  LookupTeamListDto,
  TeamDto,
  TeamFilters,
  TeamListDto,
  UpdateTeamDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { toQuery } from './query';

// ─── Admin CRUD (/teams) ─────────────────────────────────

export function listTeams(filters: TeamFilters = {}): Promise<TeamListDto> {
  return apiJson<TeamListDto>(
    `/teams${toQuery({ active: filters.active, q: filters.q })}`,
    { method: 'GET' },
  );
}

export function getTeam(id: string): Promise<TeamDto> {
  return apiJson<TeamDto>(`/teams/${id}`, { method: 'GET' });
}

export function createTeam(body: CreateTeamDto): Promise<TeamDto> {
  return apiJson<TeamDto>('/teams', { method: 'POST', json: body });
}

export function updateTeam(id: string, body: UpdateTeamDto): Promise<TeamDto> {
  return apiJson<TeamDto>(`/teams/${id}`, { method: 'PATCH', json: body });
}

export function deactivateTeam(id: string): Promise<TeamDto> {
  return apiJson<TeamDto>(`/teams/${id}/deactivate`, { method: 'POST' });
}

export function reactivateTeam(id: string): Promise<TeamDto> {
  return apiJson<TeamDto>(`/teams/${id}/reactivate`, { method: 'POST' });
}

/** Hard-delete — guarded server-side (409 if referenced). Admin only. */
export function hardDeleteTeam(
  id: string,
  body: DeleteWithReasonDto,
): Promise<void> {
  return apiJson<void>(`/teams/${id}`, { method: 'DELETE', json: body });
}

// ─── Lookup (/lookups/teams) ─────────────────────────────

/**
 * Compact teams for the vehicle-form dropdown. Carries each team's dispatcher
 * roster (with the per-dispatcher `active` flag) so the form renders a member
 * preview without a second round-trip.
 */
export function listTeamLookups(): Promise<LookupTeamListDto> {
  return apiJson<LookupTeamListDto>('/lookups/teams', { method: 'GET' });
}
