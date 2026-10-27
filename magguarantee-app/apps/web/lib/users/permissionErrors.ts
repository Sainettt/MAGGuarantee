// The per-user permission refusals of `PATCH /users/:id` (docs/25 §3 B6,
// docs/13 «Персональные права»), by their RFC 7807 `extensions.code`. The
// admin form shows each one INSIDE the form, under the group it concerns
// (docs/14 A.9) — never as a toast.

import {
  USER_ADMIN_CANNOT_BE_DENIED,
  USER_CARRIER_ROLE_LOCKED,
  USER_PERMISSION_NOT_GRANTABLE,
  USER_PERMISSION_NOT_REVOCABLE,
} from '@magguarantee/shared';

import { problemCode, problemExtensions } from '@/lib/api/problemCode';
import { isPermission, type Permission } from '@/lib/auth/permissions';

export type PermissionErrorKind =
  | 'notGrantable'
  | 'notRevocable'
  | 'adminCannotBeDenied'
  | 'carrierRoleLocked';

export interface PermissionOverrideError {
  kind: PermissionErrorKind;
  /** `extensions.permissions` — the refused ids (catalog values only); `[]` if absent. */
  permissions: Permission[];
}

const KIND_BY_CODE: Readonly<Record<string, PermissionErrorKind>> = {
  [USER_PERMISSION_NOT_GRANTABLE]: 'notGrantable',
  [USER_PERMISSION_NOT_REVOCABLE]: 'notRevocable',
  [USER_ADMIN_CANNOT_BE_DENIED]: 'adminCannotBeDenied',
  [USER_CARRIER_ROLE_LOCKED]: 'carrierRoleLocked',
};

/** Which B6 refusal `err` is, or `undefined` for anything else. */
export function permissionOverrideError(err: unknown): PermissionOverrideError | undefined {
  const code = problemCode(err);
  const kind = code === undefined ? undefined : KIND_BY_CODE[code];
  if (!kind) return undefined;
  const raw = problemExtensions(err)?.permissions;
  const permissions = Array.isArray(raw)
    ? [...new Set(raw.filter((p): p is string => typeof p === 'string').filter(isPermission))]
    : [];
  return { kind, permissions };
}

/** The form field the message goes under: the «Dodatkowe» / «Odebrane» group, or the role. */
export function permissionErrorField(
  kind: PermissionErrorKind,
): 'extraPermissions' | 'deniedPermissions' | 'role' {
  switch (kind) {
    case 'notGrantable':
      return 'extraPermissions';
    case 'notRevocable':
    case 'adminCannotBeDenied':
      return 'deniedPermissions';
    case 'carrierRoleLocked':
      return 'role';
  }
}

/**
 * The message key, relative to the `users` namespace. A refusal that names
 * the refused ids uses the `{list}` variant; without them the `…Generic` one
 * (A.9). The admin and carrier refusals carry no list.
 */
export function permissionErrorMessageKey(error: PermissionOverrideError): string {
  const withList = error.permissions.length > 0;
  switch (error.kind) {
    case 'notGrantable':
      return withList ? 'permissions.errors.notGrantable' : 'permissions.errors.notGrantableGeneric';
    case 'notRevocable':
      return withList ? 'permissions.errors.notRevocable' : 'permissions.errors.notRevocableGeneric';
    case 'adminCannotBeDenied':
      return 'permissions.errors.adminCannotBeDenied';
    case 'carrierRoleLocked':
      return 'errors.carrierRoleLocked';
  }
}
