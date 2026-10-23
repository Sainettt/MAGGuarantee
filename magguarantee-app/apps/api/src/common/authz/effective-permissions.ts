// Effective permissions of a user (docs/25 §3 B2 → B4).
//
// The ONE place the api turns a user row into the set of actions it may take.
// Both consumers go through here, so they can never disagree:
//   - JwtAccessStrategy.validate → `AuthUser.permissions` (read by
//     PermissionsGuard and `can()`; computed once per request);
//   - AuthService.toUserDto / GET /auth/me → `UserDto.permissions` (the web
//     gates its UI on that list).
//
// Today the set is exactly `permissionsFor(role, lider)`. B6 adds per-user
// extra/denied overrides HERE and nowhere else — which is why callers pass the
// user and not a `(role, lider)` pair.

import { PERMISSIONS, permissionsFor, type Permission, type Role } from '@magguarantee/shared';

/**
 * The part of a user the computation reads. Both `UserRow` and `AuthUser`-like
 * objects satisfy it. `lider` is required on purpose: a caller that forgot it
 * would silently drop the leader permissions instead of failing to compile.
 */
export interface PermissionSubject {
  readonly role: Role;
  readonly lider: boolean;
}

/** The user's effective permissions. A fresh set — callers may not share it. */
export function effectivePermissions(user: PermissionSubject): ReadonlySet<Permission> {
  return new Set(permissionsFor(user.role, user.lider));
}

/**
 * Wire form of a permission set: deduplicated, in catalog (`PERMISSIONS`)
 * order, so the response is stable and diffable whatever order the set was
 * built in. It is the catalog filtered by membership, so a value outside the
 * catalog can never reach the wire.
 */
export function toPermissionList(permissions: ReadonlySet<Permission>): Permission[] {
  return PERMISSIONS.filter((p) => permissions.has(p));
}
