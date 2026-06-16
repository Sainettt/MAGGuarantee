// Typed API wrappers for /api/v1/users/*. Admin-only on the server side
// (RolesGuard at controller level); the web caller relies on the admin
// route-group guard for UI gating.

import type {
  CreateUserDto,
  ResetPasswordModeDto,
  UpdateUserDto,
  UserDtoFull,
  UserFilters,
  UserWithTemporaryPasswordDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { type Paginated, toQuery } from './query';

export function listUsers(
  filters: UserFilters = { limit: 50 },
): Promise<Paginated<UserDtoFull>> {
  return apiJson<Paginated<UserDtoFull>>(`/users${toQuery(filters)}`, {
    method: 'GET',
  });
}

export function getUser(id: string): Promise<UserDtoFull> {
  return apiJson<UserDtoFull>(`/users/${id}`, { method: 'GET' });
}

export function createUser(
  body: CreateUserDto,
): Promise<UserWithTemporaryPasswordDto> {
  return apiJson<UserWithTemporaryPasswordDto>('/users', {
    method: 'POST',
    json: body,
  });
}

export function updateUser(
  id: string,
  body: UpdateUserDto,
): Promise<UserDtoFull> {
  return apiJson<UserDtoFull>(`/users/${id}`, {
    method: 'PATCH',
    json: body,
  });
}

export function deactivateUser(id: string): Promise<UserDtoFull> {
  return apiJson<UserDtoFull>(`/users/${id}/deactivate`, { method: 'POST' });
}

export function reactivateUser(id: string): Promise<UserDtoFull> {
  return apiJson<UserDtoFull>(`/users/${id}/reactivate`, { method: 'POST' });
}

// Phase 9 — admin reset is now a discriminated union:
//   { mode: 'generate' }            → API generates a random password
//   { mode: 'custom', password }    → admin-supplied password
// Either way the API sets mustChangePassword=true and returns the effective
// plaintext once as `temporaryPassword`.
export function resetUserPassword(
  id: string,
  body: ResetPasswordModeDto,
): Promise<UserWithTemporaryPasswordDto> {
  return apiJson<UserWithTemporaryPasswordDto>(
    `/users/${id}/reset-password`,
    { method: 'POST', json: body },
  );
}

export function deleteUser(id: string): Promise<void> {
  return apiJson<void>(`/users/${id}`, { method: 'DELETE' });
}
