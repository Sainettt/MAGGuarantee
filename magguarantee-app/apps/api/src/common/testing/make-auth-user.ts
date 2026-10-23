// Test factory for `AuthUser` (docs/25 §3 B2.0).
//
// `AuthUser.permissions` is required and, in production, only
// `JwtAccessStrategy.validate` fills it (`permissionsFor(role, lider)`). Specs
// build users here so the set is derived the same way — never hand-written,
// never stale after `role` changes. Pass `permissions` explicitly only to model
// an exotic user (e.g. a B6 override, or the guard's fail-closed branch).
//
// Not a spec file and imports nothing from Jest: usable from any test helper.

import { permissionsFor, type Role } from '@magguarantee/shared';

import type { AuthUser } from '../../modules/auth/decorators/current-user.decorator';

/**
 * Everything but `role`: the role is the first argument, and the permission set
 * is derived from it — overriding one without the other would build a user the
 * strategy can never produce.
 */
export type AuthUserOverrides = Partial<Omit<AuthUser, 'role'>>;

/**
 * A user as `JwtAccessStrategy.validate` would attach it to `req.user`.
 * Defaults: `sub` `u-<role>`, `login`/`name` `<role>`, `email`
 * `<role>@magtrans.eu`, `mustChangePassword` false; `teamId` and `lider` stay
 * absent unless given (their "none" meaning, like the existing fixtures).
 * `permissions` = `permissionsFor(role, overrides.lider ?? false)` unless given.
 */
export function makeAuthUser(role: Role, overrides: AuthUserOverrides = {}): AuthUser {
  const { permissions, ...rest } = overrides;
  return {
    sub: `u-${role}`,
    login: role,
    email: `${role}@magtrans.eu`,
    name: role,
    mustChangePassword: false,
    ...rest,
    // After the spread: a stray `role` in an untyped overrides object cannot
    // desynchronise the role from its permission set.
    role,
    permissions: permissions ?? new Set(permissionsFor(role, overrides.lider ?? false)),
  };
}

/**
 * The same person under another role — replaces `{ ...user, role: 'admin' }`,
 * which would keep the OLD role's permission set. `role` and `permissions` of
 * `base` are dropped and re-derived (`lider` and every other field are kept);
 * `overrides` apply on top, as in {@link makeAuthUser}.
 */
export function withRole(base: AuthUser, role: Role, overrides: AuthUserOverrides = {}): AuthUser {
  const { role: _previousRole, permissions: _previousPermissions, ...person } = base;
  return makeAuthUser(role, { ...person, ...overrides });
}
