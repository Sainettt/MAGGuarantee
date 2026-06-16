'use client';

// TanStack Query hooks for /users. List queries key by filters; mutations
// invalidate the entire `['users']` namespace so list + detail re-fetch.
// Phase 4.4 — admin user management page.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CreateUserDto,
  ResetPasswordModeDto,
  UpdateUserDto,
  UserDtoFull,
  UserFilters,
  UserWithTemporaryPasswordDto,
} from '@magguarantee/shared';

import {
  createUser,
  deactivateUser,
  deleteUser,
  getUser,
  listUsers,
  reactivateUser,
  resetUserPassword,
  updateUser,
} from '@/lib/api/users';

export const USERS_KEY = ['users'] as const;

export function useUsers(filters: UserFilters = { limit: 50 }) {
  return useQuery({
    queryKey: [...USERS_KEY, 'list', filters],
    queryFn: () => listUsers(filters),
  });
}

export function useUser(id: string | null | undefined) {
  return useQuery({
    queryKey: [...USERS_KEY, 'detail', id],
    queryFn: () => getUser(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateUser(
  opts?: UseMutationOptions<
    UserWithTemporaryPasswordDto,
    Error,
    CreateUserDto
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useUpdateUser(
  opts?: UseMutationOptions<
    UserDtoFull,
    Error,
    { id: string; body: UpdateUserDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => updateUser(id, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeactivateUser(
  opts?: UseMutationOptions<UserDtoFull, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateUser,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useReactivateUser(
  opts?: UseMutationOptions<UserDtoFull, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reactivateUser,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useResetUserPassword(
  opts?: UseMutationOptions<
    UserWithTemporaryPasswordDto,
    Error,
    { id: string; body: ResetPasswordModeDto }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => resetUserPassword(id, body),
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
      opts?.onSuccess?.(...args);
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
