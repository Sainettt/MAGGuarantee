// Permissions catalog — the single source of "who may do what"
// (docs/25-permissions-layer-plan.md §2, stage B1).
//
// A role stays the user TYPE and the key of data scope (which rows a user
// sees: `_scopeFilters`, ownership guards). A permission names one ACTION.
// After track B a role's rights change here, not in `@Roles` on 150 routes,
// in service checks and in `role ===` comparisons in the web.
//
// Runtime-dependency-free on purpose: this module is imported by the api, by
// the web and by the Next.js edge middleware. Only TYPE imports below — no zod
// at runtime (a test asserts it).
//
// The api's `PermissionsGuard` and services read it through
// `AuthUser.permissions` (docs/25 B2–B5). The contract that it reproduces the
// pre-track-B access exactly is
// `apps/api/src/common/authz/endpoint-permissions.spec.ts` (the generated
// per-route permission fixture against the frozen roles fixture).
// Human-readable descriptions and the docs/03 table live in
// `./permissions-matrix.ts` (not exported from the barrel).
//
// Per-user overrides (B6): `GRANTABLE_EXTRA`, `DEPENDENT_PERMISSIONS`,
// `effectivePermissionsFor` and `pruneOverrides` at the bottom — the api's
// `common/authz/effective-permissions.ts` is their only runtime consumer for a
// request's set.

import type { Role } from './schemas/auth';
import type { LiderRole } from './schemas/common';

// ─── Catalog ───────────────────────────────────────────────

/**
 * Every permission, `domain.action` (snake_case inside a segment). The order is
 * the display order of the docs/03 matrix and of {@link permissionsFor}.
 */
export const PERMISSIONS = [
  // wnioski
  'claims.read',
  'claims.submit',
  'claims.verify',
  'claims.verify_pending_authorization',
  'dashboard.read',
  // carriers
  'carriers.read',
  'carriers.write',
  'carriers.delete',
  'carrier_documents.read',
  'carrier_documents.add',
  'carrier_documents.delete',
  // fleet
  'vehicles.read',
  'vehicles.rates.read',
  'vehicles.fuel_card.read',
  'vehicles.planner_transfer.request',
  'vehicles.planner_transfer.decide',
  'vehicles.planner_history.read',
  'drivers.read',
  'trailers.read',
  'fleet.write',
  'fleet.hard_delete',
  'gps.read',
  'gps.refresh',
  // delegations + km
  'delegations.read',
  'delegations.create',
  'delegations.cancel',
  'delegations.mark_ready',
  'delegations.transit',
  'km.read',
  'km.verify',
  // role panels
  'panel.opiekun',
  'panel.planista',
  'panel.dyspozytor',
  'panel.carrier',
  // lookups + integrations
  'lookups.staff',
  'lookups.carriers',
  'integrations.external',
  'bugbot.submit_idea',
  // administration
  'users.manage',
  'sso.manage',
  'teams.manage',
  'trailer_types.manage',
  'limits.manage',
  'audit.read',
  'diagnostics.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set<string>(PERMISSIONS);

/** True for a catalog string — e.g. to ignore unknown stored overrides (B6). */
export function isPermission(value: string): value is Permission {
  return KNOWN_PERMISSIONS.has(value);
}

// ─── Role → permissions ────────────────────────────────────

/**
 * What each role may do by role alone (no leader flag). Keys are in
 * `RoleSchema.options` order (a test pins it); {@link rolesSatisfying} returns
 * roles in this order.
 *
 * `admin` is NOT "every permission": today admin cannot file a wniosek or an
 * outing, and has no carrier panel (`claims.submit`, `delegations.create`,
 * `panel.carrier`) — do not "simplify" it to `PERMISSIONS`. He does file
 * planner-transfer requests (docs/29 U1 reversed 2026-10-23); R4 in
 * `planner-transfer.rules.ts` keeps him from deciding his own.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  admin: [
    'claims.read',
    'claims.verify',
    'claims.verify_pending_authorization',
    'dashboard.read',
    'carriers.read',
    'carriers.write',
    'carriers.delete',
    'carrier_documents.read',
    'carrier_documents.add',
    'carrier_documents.delete',
    'vehicles.read',
    'vehicles.rates.read',
    'vehicles.fuel_card.read',
    'vehicles.planner_transfer.request',
    'vehicles.planner_transfer.decide',
    'vehicles.planner_history.read',
    'drivers.read',
    'trailers.read',
    'fleet.write',
    'fleet.hard_delete',
    'gps.read',
    'gps.refresh',
    'delegations.read',
    'delegations.cancel',
    'delegations.mark_ready',
    'delegations.transit',
    'km.read',
    'km.verify',
    'panel.opiekun',
    'panel.planista',
    'panel.dyspozytor',
    'lookups.staff',
    'lookups.carriers',
    'integrations.external',
    'bugbot.submit_idea',
    'users.manage',
    'sso.manage',
    'teams.manage',
    'trailer_types.manage',
    'limits.manage',
    'audit.read',
    'diagnostics.manage',
  ],
  pracownik: ['claims.read', 'claims.verify', 'dashboard.read', 'lookups.carriers'],
  opiekun: [
    'carriers.read',
    'carriers.write',
    'carrier_documents.read',
    'carrier_documents.add',
    'carrier_documents.delete',
    'vehicles.read',
    'vehicles.rates.read',
    'vehicles.fuel_card.read',
    'vehicles.planner_transfer.request',
    'vehicles.planner_history.read',
    'drivers.read',
    'trailers.read',
    'fleet.write',
    'gps.read',
    'delegations.read',
    'km.read',
    'panel.opiekun',
    'lookups.staff',
    'lookups.carriers',
    'integrations.external',
  ],
  planista: [
    'vehicles.read',
    'vehicles.rates.read',
    'vehicles.planner_transfer.request',
    'vehicles.planner_history.read',
    'gps.read',
    'delegations.read',
    'km.read',
    'panel.planista',
  ],
  dyspozytor: ['vehicles.read', 'gps.read', 'delegations.read', 'km.read', 'panel.dyspozytor'],
  przewoznik: [
    'claims.read',
    'claims.submit',
    'vehicles.read',
    'vehicles.rates.read',
    'vehicles.fuel_card.read',
    'drivers.read',
    'trailers.read',
    'gps.read',
    'delegations.read',
    'delegations.create',
    'delegations.cancel',
    'km.read',
    'panel.carrier',
  ],
  // `vehicles.rates.read`: eksport and weryfikator see the «Stawki» block of the
  // delegation modal (server scrub hides it from dyspozytor only, docs/14
  // §6.4.1). They cannot open a vehicle card, so the vehicle-side scrub never
  // sees them.
  eksport: ['vehicles.rates.read', 'delegations.read', 'delegations.mark_ready', 'km.read'],
  weryfikator: [
    'vehicles.rates.read',
    'delegations.read',
    'delegations.transit',
    'km.read',
    'km.verify',
  ],
} satisfies Record<Role, readonly Permission[]>;

/**
 * What the leader flag (`User.lider`, docs/28) adds on top of the base role.
 * Leader only ADDS (a test pins `permissionsFor(r, true) ⊇ permissionsFor(r, false)`);
 * leader scope, if ever needed, lives inside the base role's scope branch.
 *
 * `planista` → deciding planner transfers (docs/29). The service still checks
 * that the decider is the lider of THIS transfer's `fromPlanner` and neither
 * its author nor its target (`planner-transfer.rules.ts`).
 */
export const LIDER_PERMISSIONS: Readonly<Partial<Record<LiderRole, readonly Permission[]>>> = {
  planista: ['vehicles.planner_transfer.decide'],
} satisfies Partial<Record<LiderRole, readonly Permission[]>>;

// Widened view so a plain `Role` can index it (non-leader roles have no entry).
const LIDER_EXTRAS: Readonly<Partial<Record<Role, readonly Permission[]>>> = LIDER_PERMISSIONS;

function isRoleKey(value: string): value is Role {
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value);
}

/** Every role, in `ROLE_PERMISSIONS` key order (= `RoleSchema.options`). */
const ROLE_ORDER: readonly Role[] = Object.keys(ROLE_PERMISSIONS).filter(isRoleKey);

// ─── Queries ───────────────────────────────────────────────

const effectiveCache = new Map<string, readonly Permission[]>();

/**
 * The permissions of `(role, lider)`: `ROLE_PERMISSIONS[role] ∪
 * (lider ? LIDER_PERMISSIONS[role] : [])`, deduplicated, in catalog order.
 *
 * Fails closed: a string that is not a role (e.g. an unverified JWT claim on
 * the edge) yields no permissions.
 */
export function permissionsFor(role: Role, lider = false): readonly Permission[] {
  const key = `${role}\u0000${lider ? '1' : '0'}`;
  const cached = effectiveCache.get(key);
  if (cached) return cached;
  if (!isRoleKey(role)) return [];

  const granted = new Set<Permission>(ROLE_PERMISSIONS[role]);
  if (lider) {
    for (const p of LIDER_EXTRAS[role] ?? []) granted.add(p);
  }
  const ordered = PERMISSIONS.filter((p) => granted.has(p));
  effectiveCache.set(key, ordered);
  return ordered;
}

/** True when `(role, lider)` holds `permission`. */
export function hasPermission(role: Role, permission: Permission, lider = false): boolean {
  return permissionsFor(role, lider).includes(permission);
}

/** Any-of: true when `(role, lider)` holds at least one of `permissions`. */
export function hasAnyPermission(
  role: Role,
  permissions: readonly Permission[],
  lider = false,
): boolean {
  const granted = permissionsFor(role, lider);
  return permissions.some((p) => granted.includes(p));
}

export interface RolesSatisfyingOptions {
  /**
   * Count a role when its LEADER variant satisfies the requirement. This is
   * how the catalog is compared with the pre-track-B role sets (the api's
   * `endpoint-roles` fixture), which could not express the flag: admin and
   * planista on the planner-transfer decide routes ⇔
   * `vehicles.planner_transfer.decide`, held by admin and by a planista only
   * through `LIDER_PERMISSIONS` (docs/25 B1, decision 2026-10-23).
   */
  lider?: boolean;
}

/**
 * The roles admitted by an any-of requirement — what a route guarded by
 * `@RequirePermission(...required)` lets through, in role order. An empty
 * requirement admits nobody. Used by the B1/B2 equivalence specs against the
 * `endpoint-roles` snapshot.
 */
export function rolesSatisfying(
  required: readonly Permission[],
  options: RolesSatisfyingOptions = {},
): Role[] {
  const lider = options.lider ?? false;
  return ROLE_ORDER.filter((role) => hasAnyPermission(role, required, lider));
}

// ─── Per-user overrides (docs/25 §3 B6) ────────────────────
//
// `User.extraPermissions` grants rights ON TOP of the role, `User.
// deniedPermissions` removes rights FROM the role's base set. Both are text[]
// columns without a DB check against the catalog (it changes without a
// migration), so validity is enforced here twice: the api refuses a write that
// does not fit (422), and {@link effectivePermissionsFor} filters the stored
// values again on read — a write path that missed a prune can never widen
// access.

/**
 * Which rights may be granted ON TOP of a role (`User.extraPermissions`). A
 * role without an entry may be granted nothing.
 *
 * Every entry must be a right whose data scope the role ALREADY has — a
 * capability without a scope branch either shows empty screens or, worse,
 * falls into "sees everything" (docs/25 R4). Example of a refusal: `planista` +
 * `claims.verify` (no planista branch in the wnioski scope).
 *
 * przewoznik → `carrier_documents.read` / `.add` (first real case, decision
 * 2026-10-23): the documents of the carrier's OWN company, scoped by
 * `CarrierOwnershipGuard` (`@CarrierOwns('id','param','carrierId')`) on the
 * five carrier-document routes. Never `.delete` (a test pins it).
 */
export const GRANTABLE_EXTRA: Readonly<Partial<Record<Role, readonly Permission[]>>> = {
  przewoznik: ['carrier_documents.read', 'carrier_documents.add'],
} satisfies Partial<Record<Role, readonly Permission[]>>;

/**
 * right → the rights it is useless without. For the UI only: revoking a right
 * someone else in this map depends on makes the admin form warn and offer to
 * revoke the dependants too. The api does not enforce it — a user left with
 * `claims.verify` but without `claims.read` simply gets 403 on the list.
 *
 * Not an invariant of the role matrix: eksport and weryfikator hold
 * `vehicles.rates.read` without `vehicles.read` (they read rates in the
 * delegation modal only, never on a vehicle card).
 */
export const DEPENDENT_PERMISSIONS: Readonly<Partial<Record<Permission, readonly Permission[]>>> = {
  'claims.verify': ['claims.read'],
  'claims.verify_pending_authorization': ['claims.verify'],
  'claims.submit': ['claims.read'],
  'carrier_documents.add': ['carrier_documents.read'],
  'carrier_documents.delete': ['carrier_documents.read'],
  'vehicles.rates.read': ['vehicles.read'],
  'vehicles.fuel_card.read': ['vehicles.read'],
  'vehicles.planner_transfer.request': ['vehicles.read'],
  'vehicles.planner_transfer.decide': ['vehicles.read'],
  'vehicles.planner_history.read': ['vehicles.read'],
  'gps.refresh': ['gps.read'],
  'km.verify': ['km.read'],
  'delegations.create': ['delegations.read'],
  'delegations.cancel': ['delegations.read'],
  'delegations.mark_ready': ['delegations.read'],
  'delegations.transit': ['delegations.read'],
} satisfies Partial<Record<Permission, readonly Permission[]>>;

const NONE: readonly Permission[] = [];

/** `GRANTABLE_EXTRA[role]` in catalog order; `[]` for a role without an entry or a non-role. */
export function grantableExtraFor(role: Role): readonly Permission[] {
  if (!isRoleKey(role)) return NONE;
  const grantable = new Set<Permission>(GRANTABLE_EXTRA[role] ?? NONE);
  return PERMISSIONS.filter((p) => grantable.has(p));
}

/**
 * What may be put into `User.deniedPermissions` for `(role, lider)`: the base
 * set — except for `admin`, who can never be denied anything (decision Q4,
 * 2026-10-27; the api answers 422 `USER_ADMIN_CANNOT_BE_DENIED`).
 */
export function revocablePermissionsFor(role: Role, lider = false): readonly Permission[] {
  return role === 'admin' ? NONE : permissionsFor(role, lider);
}

/**
 * The rights that depend on `permission` (directly or through a chain) in
 * {@link DEPENDENT_PERMISSIONS}, in catalog order — what the admin form offers
 * to revoke together with it.
 */
export function permissionsDependingOn(permission: Permission): Permission[] {
  const found = new Set<Permission>();
  const queue: Permission[] = [permission];
  while (queue.length > 0) {
    const current = queue.shift() as Permission;
    for (const candidate of PERMISSIONS) {
      if (found.has(candidate) || candidate === permission) continue;
      if ((DEPENDENT_PERMISSIONS[candidate] ?? NONE).includes(current)) {
        found.add(candidate);
        queue.push(candidate);
      }
    }
  }
  return PERMISSIONS.filter((p) => found.has(p));
}

/**
 * The effective rights of one user (docs/25 §3 B6), in catalog order:
 *
 *   (permissionsFor(role, lider) ∪ (extra ∩ GRANTABLE_EXTRA[role])) − denied
 *
 * Denial wins. Both lists are the STORED values (`string[]`): an entry outside
 * the catalog matches nothing, an extra outside `GRANTABLE_EXTRA[role]` is
 * ignored, a denial outside the base set has nothing to remove. On every row a
 * write path can produce (extra ⊆ grantable, denied ⊆ base, and the two sets
 * are disjoint — a test pins it) this equals `… − (denied ∩ base)`; on a row
 * that missed a prune, a right listed in BOTH lists stays denied.
 *
 * Fails closed like {@link permissionsFor}: a non-role gets nothing, extras
 * included.
 */
export function effectivePermissionsFor(
  role: Role,
  lider: boolean,
  extra: readonly string[],
  denied: readonly string[],
): Permission[] {
  const granted = new Set<string>(permissionsFor(role, lider));
  const grantable = new Set<string>(grantableExtraFor(role));
  for (const p of extra) if (grantable.has(p)) granted.add(p);
  for (const p of denied) granted.delete(p);
  return PERMISSIONS.filter((p) => granted.has(p));
}

/** What {@link pruneOverrides} keeps and what it drops. */
export interface PrunedOverrides {
  /** The extras that still fit `(role)`, deduplicated, in catalog order. */
  extra: Permission[];
  /** The denials that still fit `(role, lider)`, deduplicated, in catalog order. */
  denied: Permission[];
  /** Distinct stored entries dropped — unknown strings included — in input order. */
  removed: { extra: string[]; denied: string[] };
}

/**
 * Drops the overrides a `(role, lider)` no longer admits: extras outside
 * `GRANTABLE_EXTRA[role]`, denials outside {@link revocablePermissionsFor}
 * (every denial on `admin`), anything outside the catalog, and an extra that
 * is denied as well (denial wins, so it never took effect). Applied by the api
 * whenever `role` or `lider` changes — by an admin or by the directory — in
 * the same UPDATE (docs/25 §3 B6 «Смена роли»).
 *
 * Never changes what the row grants under `(role, lider)`: for every role but
 * `admin`, `effectivePermissionsFor` of the result equals that of the input (a
 * test pins it); on `admin` it only drops denials (decision Q4).
 */
export function pruneOverrides(
  role: Role,
  lider: boolean,
  extra: readonly string[],
  denied: readonly string[],
): PrunedOverrides {
  const deniedInput = new Set<string>(denied);
  const keepExtra = splitByAllowed(
    extra,
    grantableExtraFor(role).filter((p) => !deniedInput.has(p)),
  );
  const keepDenied = splitByAllowed(denied, revocablePermissionsFor(role, lider));
  return {
    extra: keepExtra.kept,
    denied: keepDenied.kept,
    removed: { extra: keepExtra.dropped, denied: keepDenied.dropped },
  };
}

function splitByAllowed(
  values: readonly string[],
  allowed: readonly Permission[],
): { kept: Permission[]; dropped: string[] } {
  const allowedSet = new Set<string>(allowed);
  const present = new Set<string>();
  const dropped: string[] = [];
  for (const value of values) {
    if (allowedSet.has(value)) {
      present.add(value);
    } else if (!dropped.includes(value)) {
      dropped.push(value);
    }
  }
  return { kept: PERMISSIONS.filter((p) => present.has(p)), dropped };
}
