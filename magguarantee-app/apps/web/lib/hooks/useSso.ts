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

export function useStanowiskoRoles() {
  return useQuery({
    queryKey: [...SSO_KEY, 'stanowisko-roles'],
    queryFn: listStanowiskoRoles,
  });
}

export function useSsoAccessDenials() {
  return useQuery({
    queryKey: [...SSO_KEY, 'access-denials'],
    queryFn: listSsoAccessDenials,
  });
}

export function useSetStanowiskoRole(
  opts?: UseMutationOptions<
    StanowiskoRoleDto,
    Error,
    { code: string; role: AssignableRole }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, role }: { code: string; role: AssignableRole }) =>
      setStanowiskoRole(code, role),
    ...opts,
    onSuccess: (...args) => {
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
