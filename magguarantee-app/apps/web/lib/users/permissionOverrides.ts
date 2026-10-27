// Pure helpers of the «Uprawnienia indywidualne» block of the admin user form
// (docs/14 «UserSheet — blok „Uprawnienia indywidualne”» A.3–A.7 / A.11,
// docs/25 §3 B6). Everything is derived from the shared catalog —
// `GRANTABLE_EXTRA`, `DEPENDENT_PERMISSIONS`, `permissionsFor` — so the form
// previews exactly what the api will compute (`effectivePermissionsFor`).
//
// State model: the form keeps the FULL lists the admin built (`extra`,
// `denied`), even entries the currently selected role does not admit. What is
// shown, previewed and sent is the KEPT part for the current `(role, lider)`
// (`droppedOnRoleChange`); the rest is listed in the «will be removed» notice.
// Switching the role back brings the entries back — the drop is computed, not
// stored (A.7).

import type { Role } from '@magguarantee/shared';

import {
  DEPENDENT_PERMISSIONS,
  effectivePermissionsFor,
  grantableExtraFor,
  isPermission,
  permissionsDependingOn,
  permissionsFor,
  pruneOverrides,
  revocablePermissionsFor,
  type Permission,
} from '@/lib/auth/permissions';
import { sortPermissions } from '@/lib/auth/permissionGroups';

export interface OverridesState {
  extra: Permission[];
  denied: Permission[];
}

/** The stored lists, as `UserDtoFull` carries them. */
export interface StoredOverrides {
  extraPermissions: readonly Permission[];
  deniedPermissions: readonly Permission[];
}

/**
 * The role the block is computed for (A.3): the hand-granted `roleOverride`
 * on a MAGSpace account, `role` otherwise — the rule of «Przełożony (lider)»
 * (W16). A carrier row is always `przewoznik` (its role is locked, A.8).
 */
export function overridesRole(input: {
  role: Role;
  managedBy: 'local' | 'magspace';
  roleOverride: Role | '' | null;
}): Role {
  if (input.role === 'przewoznik') return 'przewoznik';
  return input.managedBy === 'magspace' && input.roleOverride
    ? input.roleOverride
    : input.role;
}

/** «Dodatkowe» checkboxes (A.3): `GRANTABLE_EXTRA[role]` minus what `(role, lider)` already holds. */
export function extraOptions(role: Role, lider: boolean): Permission[] {
  const base = new Set<Permission>(permissionsFor(role, lider));
  return grantableExtraFor(role).filter((p) => !base.has(p));
}

/** «Odebrane» checkboxes (A.4): every right of `(role, lider)`; none for `admin`. */
export function deniedOptions(role: Role, lider: boolean): readonly Permission[] {
  return revocablePermissionsFor(role, lider);
}

/** True for a right `role` holds only through `LIDER_PERMISSIONS` — the «(lider)» suffix. */
export function isLiderPermission(role: Role, permission: Permission): boolean {
  return (
    permissionsFor(role, true).includes(permission) &&
    !permissionsFor(role, false).includes(permission)
  );
}

function onlyPermissions(values: readonly string[]): Permission[] {
  return values.filter(isPermission);
}

/**
 * A.7 — what `(role, lider)` keeps of the form's full lists and what it
 * drops: extras outside `GRANTABLE_EXTRA[role]` or already held by the role,
 * denials outside `permissionsFor(role, lider)` (all of them on `admin`).
 * The kept lists are what the PATCH may carry without a 422.
 */
export function droppedOnRoleChange(
  role: Role,
  lider: boolean,
  full: OverridesState,
): { kept: OverridesState; dropped: OverridesState } {
  const pruned = pruneOverrides(role, lider, full.extra, full.denied);
  const base = new Set<Permission>(permissionsFor(role, lider));
  return {
    kept: {
      extra: pruned.extra.filter((p) => !base.has(p)),
      denied: pruned.denied,
    },
    dropped: {
      extra: sortPermissions([
        ...onlyPermissions(pruned.removed.extra),
        ...pruned.extra.filter((p) => base.has(p)),
      ]),
      denied: sortPermissions(onlyPermissions(pruned.removed.denied)),
    },
  };
}

/** The rights `permission` needs (transitively) per `DEPENDENT_PERMISSIONS`, in catalog order. */
export function requiredFor(permission: Permission): Permission[] {
  const found = new Set<Permission>();
  const queue: Permission[] = [permission];
  while (queue.length > 0) {
    const current = queue.shift() as Permission;
    for (const base of DEPENDENT_PERMISSIONS[current] ?? []) {
      if (base !== permission && !found.has(base)) {
        found.add(base);
        queue.push(base);
      }
    }
  }
  return sortPermissions(found);
}

/**
 * A.3 — (un)ticking `permission` in «Dodatkowe», dependencies applied both
 * ways: ticking adds the bases it needs (among `options`), clearing removes
 * the ticked extras that depend on it. `autoAdded` / `autoRemoved` feed the
 * one-line live announcement. Entries outside `options` (dropped by the role,
 * A.7) are left untouched.
 */
export function toggleExtra(
  extra: readonly Permission[],
  permission: Permission,
  checked: boolean,
  options: readonly Permission[],
): { extra: Permission[]; autoAdded: Permission[]; autoRemoved: Permission[] } {
  const current = new Set<Permission>(extra);
  if (checked) {
    const autoAdded = requiredFor(permission).filter(
      (p) => options.includes(p) && !current.has(p),
    );
    return {
      extra: sortPermissions([...current, permission, ...autoAdded]),
      autoAdded,
      autoRemoved: [],
    };
  }
  const autoRemoved = permissionsDependingOn(permission).filter((p) => current.has(p));
  const removed = new Set<Permission>([permission, ...autoRemoved]);
  return {
    extra: sortPermissions([...current].filter((p) => !removed.has(p))),
    autoAdded: [],
    autoRemoved,
  };
}

/** (Un)ticking `permission` in «Odebrane» — no automatic action (A.4: a hint offers it). */
export function toggleDenied(
  denied: readonly Permission[],
  permission: Permission,
  checked: boolean,
): Permission[] {
  const next = new Set<Permission>(denied);
  if (checked) next.add(permission);
  else next.delete(permission);
  return sortPermissions(next);
}

/** One chip of the «Uprawnienia efektywne» preview (A.6). */
export interface EffectiveEntry {
  permission: Permission;
  /** `extra` = granted on top of the role («Dodatkowe»); `role` = the role / leader set. */
  source: 'role' | 'extra';
}

/** A.6 — `(permissionsFor(role, lider) ∪ extra) − denied` of the KEPT lists, in catalog order. */
export function effectivePreview(
  role: Role,
  lider: boolean,
  kept: OverridesState,
): EffectiveEntry[] {
  const base = new Set<Permission>(permissionsFor(role, lider));
  return effectivePermissionsFor(role, lider, kept.extra, kept.denied).map(
    (permission): EffectiveEntry => ({
      permission,
      source: base.has(permission) ? 'role' : 'extra',
    }),
  );
}

/**
 * A.4 — the rights that depend on a revoked `permission` and still take
 * effect (from the role or from «Dodatkowe»): the «Bez tego uprawnienia nie
 * zadziała: …» hint. Empty = no hint.
 */
export function dependentsOf(
  permission: Permission,
  effective: readonly Permission[],
): Permission[] {
  return permissionsDependingOn(permission).filter((p) => effective.includes(p));
}

/**
 * «Odbierz również» (A.4) — revoke everything still depending on
 * `permission`: role rights join «Odebrane», extras leave «Dodatkowe».
 * Works on the form's FULL lists.
 */
export function applyDependents(
  role: Role,
  lider: boolean,
  full: OverridesState,
  permission: Permission,
): OverridesState {
  const { kept } = droppedOnRoleChange(role, lider, full);
  const effective = effectivePermissionsFor(role, lider, kept.extra, kept.denied);
  const dependents = dependentsOf(permission, effective);
  if (dependents.length === 0) return full;
  const revocable = new Set<Permission>(deniedOptions(role, lider));
  const dependentSet = new Set<Permission>(dependents);
  return {
    extra: sortPermissions(full.extra.filter((p) => !dependentSet.has(p))),
    denied: sortPermissions([...full.denied, ...dependents.filter((p) => revocable.has(p))]),
  };
}

function sameSet(a: readonly Permission[], b: readonly Permission[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((p) => right.has(p));
}

/**
 * The PATCH fields (A.7): each list only when the KEPT list differs from the
 * stored one — like `lider` / `liderId`, an unrelated edit never re-sends them.
 */
export function overridesPatch(
  kept: OverridesState,
  stored: StoredOverrides,
): { extraPermissions?: Permission[]; deniedPermissions?: Permission[] } {
  return {
    ...(sameSet(kept.extra, stored.extraPermissions) ? {} : { extraPermissions: kept.extra }),
    ...(sameSet(kept.denied, stored.deniedPermissions) ? {} : { deniedPermissions: kept.denied }),
  };
}

/** A.11 list marker: «+1», «−2», «+1 −2» (U+2212 minus); `null` without overrides. */
export function overridesMarker(extraCount: number, deniedCount: number): string | null {
  const parts: string[] = [];
  if (extraCount > 0) parts.push(`+${extraCount}`);
  if (deniedCount > 0) parts.push(`−${deniedCount}`);
  return parts.length > 0 ? parts.join(' ') : null;
}
