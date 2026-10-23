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
// B1 changes nothing at runtime: no guard reads this file yet. The contract
// that it reproduces today's access exactly is
// `apps/api/src/common/authz/endpoint-permissions.spec.ts` (against the
// committed `@Roles` snapshot). Human-readable descriptions and the docs/03
// table live in `./permissions-matrix.ts` (not exported from the barrel).

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
 * `panel.carrier`) — do not "simplify" it to `PERMISSIONS`.
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
   * how the catalog is compared with `@Roles` metadata, which cannot express
   * the flag: `@Roles('admin', 'planista')` on the planner-transfer decide
   * routes ⇔ `vehicles.planner_transfer.decide`, held by admin and by a
   * planista only through `LIDER_PERMISSIONS` (docs/25 B1, decision 2026-10-23).
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
