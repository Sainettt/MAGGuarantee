// Capability helpers over the request user's effective permissions
// (docs/25 §3 B2 → used by services from B3 on).
//
// They read ONLY `AuthUser.permissions` — the set JwtAccessStrategy.validate
// builds once per request from `permissionsFor(role, lider)` (B6: plus the
// user's overrides). They never recompute rights from `role`: a user object
// without the set has no rights here, exactly like PermissionsGuard
// (fail closed). Scope ("which rows") stays on the role and does not belong
// here — see docs/25 §0 «Не цель».

import type { Permission } from '@magguarantee/shared';

import type { AuthUser } from '../../modules/auth/decorators/current-user.decorator';

/** The part of a user these helpers read. */
export type PermissionHolder = Pick<AuthUser, 'permissions'>;

/** True when the user holds `permission`. */
export function can(user: PermissionHolder, permission: Permission): boolean {
  return grantedPermissions(user)?.has(permission) ?? false;
}

/** Any-of, like `@RequirePermission`: an empty list grants nothing. */
export function canAny(user: PermissionHolder, permissions: readonly Permission[]): boolean {
  const granted = grantedPermissions(user);
  if (!granted) return false;
  return permissions.some((p) => granted.has(p));
}

/**
 * The permission set carried by an arbitrary `req.user`, or `null` when there
 * is none (no user, a refresh-token payload, a hand-built object without the
 * field). Shared with PermissionsGuard so both fail closed the same way.
 */
export function grantedPermissions(user: unknown): ReadonlySet<Permission> | null {
  if (typeof user !== 'object' || user === null) return null;
  const value: unknown = (user as { permissions?: unknown }).permissions;
  return value instanceof Set ? (value as ReadonlySet<Permission>) : null;
}
