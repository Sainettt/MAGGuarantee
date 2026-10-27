// The web's ONE entry point to the permissions catalog (docs/25 §3 B4).
//
// Edge-safe on purpose: `middleware.ts` → `lib/roles.ts` → this file. The
// catalog is imported through the SUBPATH `@magguarantee/shared/permissions`
// (tsconfig `paths` → `packages/shared/src/permissions.ts`, which has only
// type imports), never through the bare barrel `@magguarantee/shared`: the
// barrel pulls every zod schema and would bloat the edge bundle (docs/28
// §9.2 #18). `lib/auth/edge-imports.test.ts` walks the middleware import graph
// and fails on a value import from the barrel. Below, `@magguarantee/shared`
// appears in TYPE imports only — those are erased at compile time.
//
// Which list to check:
//   * a signed-in user (server page, client component) → his EFFECTIVE list,
//     `effectivePermissionsOf(user)` — `UserDto.permissions` from `/auth/me`
//     is authoritative: since docs/25 B6 it already carries the per-user
//     overrides (`extraPermissions` / `deniedPermissions`), never re-derive it;
//   * the edge (JWT carries the role only) → `hasAnyPermission(role, rule)`
//     with `lider = false` and no overrides (docs/25 R3) — see `lib/roles.ts`.
//     No `GRANTABLE_EXTRA` right may lead into a `PATH_PERMISSIONS` prefix the
//     role is refused on — `lib/auth/edgeOverrides.test.ts` is the tripwire.
//
// The B6 override helpers (`GRANTABLE_EXTRA`, `DEPENDENT_PERMISSIONS`, …) are
// re-exported for the admin form (`UserPermissionsBlock`), which previews what
// the api will compute — they never feed a gate.

import type { UserDto } from '@magguarantee/shared';
import { permissionsFor, type Permission } from '@magguarantee/shared/permissions';

export {
  DEPENDENT_PERMISSIONS,
  GRANTABLE_EXTRA,
  LIDER_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  effectivePermissionsFor,
  grantableExtraFor,
  hasAnyPermission,
  hasPermission,
  isPermission,
  permissionsDependingOn,
  permissionsFor,
  pruneOverrides,
  revocablePermissionsFor,
  type Permission,
  type PrunedOverrides,
} from '@magguarantee/shared/permissions';

/** One permission or an any-of list — the shape every check here accepts. */
export type PermissionRule = Permission | readonly Permission[];

/** The user fields the effective list is built from. */
export type PermissionSubject = Pick<UserDto, 'role'> & {
  lider?: boolean | null;
  permissions?: readonly Permission[] | null;
};

/**
 * The user's effective permissions: `user.permissions` as sent by `/auth/me`
 * — since docs/25 B6 the role's set plus the rights an admin granted this
 * person, minus the ones he revoked.
 *
 * The runtime `Array.isArray` check is deliberate even though the DTO type
 * says the field is required: during a rolling deploy an api that predates
 * docs/25 B4 omits it. Only then do we fall back to the role catalog
 * `permissionsFor(role, lider)`, which IGNORES the per-user overrides. That is
 * exact for such an api — it predates B6 as well and enforces the role's set
 * only. Should a B6-era response ever lack the field, the fallback would hide
 * a granted right (a carrier's «Dokumenty» tab) and still offer a revoked one;
 * the api's 403 stays the gate either way.
 */
export function effectivePermissionsOf(user: PermissionSubject): readonly Permission[] {
  return Array.isArray(user.permissions)
    ? user.permissions
    : permissionsFor(user.role, user.lider ?? false);
}

/** Any-of: true when `granted` holds `rule` (or at least one of a list). */
export function canAny(
  granted: readonly Permission[] | null | undefined,
  rule: PermissionRule,
): boolean {
  if (!granted || granted.length === 0) return false;
  const required: readonly Permission[] = typeof rule === 'string' ? [rule] : rule;
  return required.some((p) => granted.includes(p));
}

/**
 * The `(admin)` route group of the employee shell (`/employee/(admin)/*`):
 * its layout admits a user holding AT LEAST ONE of these — each page then
 * checks its own permission. Today only `admin` holds any of them
 * (`lib/auth/permissions.test.ts` pins it), so the segment is unchanged.
 */
export const ADMIN_SECTION_PERMISSIONS: readonly Permission[] = [
  'users.manage',
  'sso.manage',
  'teams.manage',
  'trailer_types.manage',
  'limits.manage',
  'audit.read',
  'diagnostics.manage',
];
