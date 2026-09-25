'use client';

// TanStack Query hooks for the Google-SSO admin screen (docs/24 §A5).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  AssignableRole,
  GrantSsoAccessDto,
  SsoAccessGrantResultDto,
  StanowiskoRoleDto,
  StanowiskoRoleListDto,
} from '@magguarantee/shared';

import {
  deleteStanowiskoRole,
  grantSsoAccess,
  listSsoAccessDenials,
  listStanowiskoRoles,
  setStanowiskoRole,
} from '@/lib/api/sso';

import { USERS_KEY } from './useUsers';

export const SSO_KEY = ['sso'] as const;

const STANOWISKO_ROLES_KEY = [...SSO_KEY, 'stanowisko-roles'] as const;

export function useStanowiskoRoles() {
  return useQuery({
    queryKey: STANOWISKO_ROLES_KEY,
    queryFn: listStanowiskoRoles,
  });
}

export function useSsoAccessDenials() {
  return useQuery({
    queryKey: [...SSO_KEY, 'access-denials'],
    queryFn: listSsoAccessDenials,
  });
}

/** `lider` omitted = keep the stored flag (see `setStanowiskoRole`). */
export interface SetStanowiskoRoleVars {
  code: string;
  role: AssignableRole;
  lider?: boolean;
}

export function useSetStanowiskoRole(
  opts?: UseMutationOptions<StanowiskoRoleDto, Error, SetStanowiskoRoleVars>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, role, lider }: SetStanowiskoRoleVars) =>
      setStanowiskoRole(code, role, lider),
    ...opts,
    onSuccess: (...args) => {
      // Write the saved row straight into the list before the refetch lands,
      // so the controlled role select / leader checkbox do not flick back to
      // the old value in between. Only the fields this call decides are
      // copied — `name` / `knownToMagspace` stay as the list computed them.
      const [saved] = args;
      qc.setQueryData<StanowiskoRoleListDto>(STANOWISKO_ROLES_KEY, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((row) =>
                row.code === saved.code
                  ? {
                      ...row,
                      role: saved.role,
                      lider: saved.lider,
                      updatedAt: saved.updatedAt,
                    }
                  : row,
              ),
            }
          : old,
      );
      qc.invalidateQueries({ queryKey: SSO_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useGrantSsoAccess(
  opts?: UseMutationOptions<SsoAccessGrantResultDto, Error, GrantSsoAccessDto>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: grantSsoAccess,
    ...opts,
    onSuccess: (...args) => {
      // The denial row flips to «granted», and a User row was created or
      // changed — Użytkownicy must not keep showing the stale one.
      qc.invalidateQueries({ queryKey: SSO_KEY });
      qc.invalidateQueries({ queryKey: USERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeleteStanowiskoRole(
  opts?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteStanowiskoRole,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: SSO_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}
