'use client';

// Phase 11 — TanStack Query hooks for /teams (admin CRUD). The lookup hook
// (`useTeamLookups`) lives in useLookups.ts to sit with the other people-
// pickers; this file owns the mutable CRUD list (`useTeams`) + mutations.
//
// Mutating a team can change the dispatcher roster a vehicle shows
// (`Vehicle.dispatchTeam` is embedded on the vehicle + fleet payloads), so
// every mutation invalidates the vehicles + fleet caches too — otherwise an
// admin renaming a team or moving a dispatcher would see stale rosters in the
// vehicle modals until a hard refresh. The lookup cache is invalidated so the
// vehicle-form dropdown reflects new/renamed/(de)activated teams immediately.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CreateTeamDto,
  DeleteWithReasonDto,
  TeamDto,
  TeamFilters,
  UpdateTeamDto,
} from '@magguarantee/shared';

import {
  createTeam,
  deactivateTeam,
  getTeam,
  hardDeleteTeam,
  listTeams,
  reactivateTeam,
  updateTeam,
} from '@/lib/api/teams';
import { MY_FLEET_KEY } from '@/lib/hooks/useMyFleet';
import { VEHICLES_KEY } from '@/lib/hooks/useVehicles';
import type { MutationMetaOptions } from '@/lib/query/globalErrors';

export const TEAMS_KEY = ['teams'] as const;
export const TEAM_LOOKUPS_KEY = ['lookups', 'teams'] as const;

export function useTeams(filters: TeamFilters = {}) {
  return useQuery({
    queryKey: [...TEAMS_KEY, 'list', filters],
    queryFn: () => listTeams(filters),
  });
}

export function useTeam(id: string | null | undefined) {
  return useQuery({
    queryKey: [...TEAMS_KEY, 'detail', id],
    queryFn: () => getTeam(id as string),
    enabled: Boolean(id),
  });
}

/** Invalidates everything a team change can touch: the CRUD list, the lookup
 *  dropdown, and the vehicle/fleet payloads that embed `dispatchTeam`. */
function useTeamInvalidator() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TEAMS_KEY });
    qc.invalidateQueries({ queryKey: TEAM_LOOKUPS_KEY });
    qc.invalidateQueries({ queryKey: VEHICLES_KEY });
    qc.invalidateQueries({ queryKey: MY_FLEET_KEY });
  };
}

export function useCreateTeam(
  opts?: UseMutationOptions<TeamDto, Error, CreateTeamDto>,
) {
  const invalidate = useTeamInvalidator();
  return useMutation({
    mutationFn: createTeam,
    ...opts,
    onSuccess: (...args) => {
      invalidate();
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateTeam(
  opts?: UseMutationOptions<
    TeamDto,
    Error,
    { id: string; body: UpdateTeamDto }
  >,
) {
  const invalidate = useTeamInvalidator();
  return useMutation({
    mutationFn: ({ id, body }) => updateTeam(id, body),
    ...opts,
    onSuccess: (...args) => {
      invalidate();
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateTeam(opts?: MutationMetaOptions) {
  const invalidate = useTeamInvalidator();
  return useMutation({
    meta: opts?.meta,
    mutationFn: deactivateTeam,
    onSuccess: invalidate,
  });
}

export function useReactivateTeam(opts?: MutationMetaOptions) {
  const invalidate = useTeamInvalidator();
  return useMutation({
    meta: opts?.meta,
    mutationFn: reactivateTeam,
    onSuccess: invalidate,
  });
}

/** Hard-delete — admin only; guarded server-side (409 if referenced). */
export function useHardDeleteTeam(opts?: MutationMetaOptions) {
  const invalidate = useTeamInvalidator();
  return useMutation({
    meta: opts?.meta,
    mutationFn: ({ id, body }: { id: string; body: DeleteWithReasonDto }) =>
      hardDeleteTeam(id, body),
    onSuccess: invalidate,
  });
}
