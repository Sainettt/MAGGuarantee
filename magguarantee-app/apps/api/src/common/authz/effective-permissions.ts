// Effective permissions of a user (docs/25 §3 B2 → B4 → B6).
//
// The ONE place the api turns a user row into the set of actions it may take.
// Both consumers go through here, so they can never disagree:
//   - JwtAccessStrategy.validate → `AuthUser.permissions` (read by
//     PermissionsGuard and `can()`; computed once per request);
//   - AuthService.toUserDto / GET /auth/me → `UserDto.permissions` (the web
//     gates its UI on that list).
//
// B6: the set is `effectivePermissionsFor(role, lider, extraPermissions,
// deniedPermissions)` from `@magguarantee/shared` — the role's rights, plus the
// rights an admin granted this person (only those `GRANTABLE_EXTRA[role]`
// admits), minus the ones he revoked (denial wins). The stored lists are read
// as they are: the shared formula filters both sides again, so a write path
// that missed a prune can never widen access.

import { Logger } from '@nestjs/common';

import {
  PERMISSIONS,
  effectivePermissionsFor,
  isPermission,
  type Permission,
  type Role,
} from '@magguarantee/shared';

/**
 * The part of a user the computation reads. `UserRow` satisfies it. Every
 * field is required on purpose: a caller that forgot `lider` or an override
 * list would silently drop rights (or a revocation) instead of failing to
 * compile. `id` keys the unknown-value warning below.
 */
export interface PermissionSubject {
  readonly id: string;
  readonly role: Role;
  readonly lider: boolean;
  /** `User.extraPermissions` as stored (text[]; may hold strings outside the catalog). */
  readonly extraPermissions: readonly string[];
  /** `User.deniedPermissions` as stored (text[]; may hold strings outside the catalog). */
  readonly deniedPermissions: readonly string[];
}

const logger = new Logger('EffectivePermissions');

/**
 * `(userId, value)` pairs already warned about. The strategy runs on
 * every request, so an unknown stored value (a permission renamed or removed
 * from the catalog since an admin set it) is logged ONCE per process, not once
 * per request. Bounded: past the cap the memory is dropped and the next
 * occurrence warns again — a missed dedupe costs a log line, never a leak.
 */
const warned = new Set<string>();
const WARNED_CAP = 10_000;

/** The user's effective permissions. A fresh set — callers may not share it. */
export function effectivePermissions(user: PermissionSubject): ReadonlySet<Permission> {
  warnUnknown(user, 'extraPermissions', user.extraPermissions);
  warnUnknown(user, 'deniedPermissions', user.deniedPermissions);
  return new Set(
    effectivePermissionsFor(user.role, user.lider, user.extraPermissions, user.deniedPermissions),
  );
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

/**
 * A stored override list as the admin API shows it (`UserDtoFull`): only
 * catalog ids, deduplicated, in catalog order. Whether an id still fits the
 * role is NOT judged here — the form shows what is stored.
 */
export function storedOverrideList(values: readonly string[]): Permission[] {
  const present = new Set(values);
  return PERMISSIONS.filter((p) => present.has(p));
}

function warnUnknown(
  user: PermissionSubject,
  field: 'extraPermissions' | 'deniedPermissions',
  values: readonly string[],
): void {
  for (const value of values) {
    if (isPermission(value)) continue;
    const key = `${user.id}\u0000${value}`;
    if (warned.has(key)) continue;
    if (warned.size >= WARNED_CAP) warned.clear();
    warned.add(key);
    logger.warn({
      msg: 'unknown permission override ignored',
      userId: user.id,
      field,
      value,
    });
  }
}
