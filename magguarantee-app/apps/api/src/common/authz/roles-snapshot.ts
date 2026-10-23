// Authorization snapshot of every served route (docs/25 §3 B1).
//
// Turns the live controller metadata into two plain, sorted, diff-friendly
// maps that are committed as fixtures BEFORE track B touches a single
// controller:
//   - `endpoint-roles.snapshot.json`     — who passes the role gate;
//   - `endpoint-ownership.snapshot.json` — which routes run an ownership guard
//     (`@OpiekunOwns` / `@CarrierOwns`) and with which arguments.
// B2 swaps `@Roles` for `@RequirePermission` and must leave both maps
// unchanged; the spec next to this file turns any drift into a red test.
//
// A `@RequirePermission` route (B2.0+) is recorded as the roles that pass it:
// `rolesSatisfying(required, { lider: true })` — a role counts when its leader
// variant holds one of the permissions, which is how the B1 fixture encodes
// the planner-transfer decide routes. `@Roles` + `@RequirePermission` on one
// route, `@Public` + `@RequirePermission`, an empty or non-catalog
// requirement are contradictions (red test), never silently recorded. The
// ownership map does not change shape: it never looked at the role gate.
//
// Everything is resolved the way the production guards resolve it:
//   - `@Public` / `@Roles` / `@RequirePermission` / `@OpiekunOwns` /
//     `@CarrierOwns` via `Reflector.getAllAndOverride([handler, class])` —
//     the handler wins (`JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`,
//     `OpiekunOwnershipGuard`, `CarrierOwnershipGuard`);
//   - `@UseGuards` as Nest's guards consumer does: class guards plus handler
//     guards, concatenated (no override).
//
// Pure: no I/O, no Nest application, no providers. The input is the route list
// produced by `common/testing/route-discovery.ts#listRoutes`.

import type { CanActivate, Type } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import {
  PERMISSIONS,
  RoleSchema,
  rolesSatisfying,
  type Permission,
  type Role,
} from '@magguarantee/shared';

import {
  IS_PUBLIC_KEY,
  PERMISSIONS_METADATA_KEY,
  ROLES_METADATA_KEY,
} from '../../modules/auth/auth.constants';
import { CarrierOwnershipGuard } from '../guards/carrier-ownership.guard';
import { OpiekunOwnershipGuard } from '../guards/opiekun-ownership.guard';
import {
  CARRIER_OWNERSHIP_KEY,
  OPIEKUN_OWNERSHIP_KEY,
  type OwnershipMeta,
  type OwnershipSource,
} from '../guards/ownership.constants';
import type { DiscoveredRoute } from '../testing/route-discovery';

// ─── Shapes ────────────────────────────────────────────────

/** `@Public()` — `JwtAuthGuard` lets the request through without a session. */
export const ACCESS_PUBLIC = 'PUBLIC' as const;
/** Session required, no `@Roles` (or an empty `@Roles()`): any role passes. */
export const ACCESS_AUTHENTICATED = 'AUTHENTICATED' as const;

/**
 * Who passes the role gate of one route. A role array is sorted in
 * `RoleSchema.options` order. It is empty only for a `@RequirePermission` that
 * admits nobody — always reported as a contradiction, and rejected by
 * {@link parseRolesSnapshot}, so it can never be committed.
 */
export type EndpointAccess =
  | typeof ACCESS_PUBLIC
  | typeof ACCESS_AUTHENTICATED
  | readonly Role[];

/** `"POST /claims/:nrZgl/preview"` (no `api/v1` prefix) → access. Keys sorted. */
export type EndpointRolesSnapshot = Readonly<Record<string, EndpointAccess>>;

/** The ownership guards that actually run on one route, with their arguments. */
export interface EndpointOwnership {
  readonly carrier?: OwnershipMeta;
  readonly opiekun?: OwnershipMeta;
}

/** Only routes with at least one enforced ownership guard appear. Keys sorted. */
export type EndpointOwnershipSnapshot = Readonly<Record<string, EndpointOwnership>>;

export interface SnapshotResult<T> {
  snapshot: T;
  /**
   * Metadata combinations that cannot mean what their author intended (e.g.
   * `@Public` + `@Roles` — `RolesGuard` 403s every caller of such a route,
   * because a public request has no `req.user`). Human-readable, one per line.
   */
  contradictions: string[];
}

/** The subset of a discovered route the builders read. */
export type SnapshotRoute = Pick<
  DiscoveredRoute,
  'key' | 'controller' | 'handler' | 'controllerRef' | 'handlerRef'
>;

const ROLE_ORDER: readonly Role[] = RoleSchema.options;

// ─── Gate resolution (shared by every builder below) ───────

/** The authorization metadata of one route, resolved like the guards do. */
interface RouteGates {
  isPublic: boolean;
  /** `@Roles` present at all (an empty `@Roles()` counts as present). */
  rolesDeclared: boolean;
  roles: Role[];
  unknownRoles: unknown[];
  /** `@RequirePermission` present at all. */
  permissionsDeclared: boolean;
  /** Catalog permissions of the requirement, in `PERMISSIONS` order. */
  permissions: Permission[];
  unknownPermissions: unknown[];
}

function resolveGates(reflector: Reflector, route: SnapshotRoute): RouteGates {
  const targets = metadataTargets(route);
  const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets);
  const declaredRoles = reflector.getAllAndOverride<unknown>(ROLES_METADATA_KEY, targets);
  const declaredPerms = reflector.getAllAndOverride<unknown>(PERMISSIONS_METADATA_KEY, targets);
  const roles = normaliseRoles(declaredRoles);
  const permissions = normalisePermissions(declaredPerms);
  return {
    isPublic: Boolean(isPublic),
    rolesDeclared: isDeclared(declaredRoles),
    roles: roles.roles,
    unknownRoles: roles.unknown,
    permissionsDeclared: isDeclared(declaredPerms),
    permissions: permissions.permissions,
    unknownPermissions: permissions.unknown,
  };
}

/**
 * How a route decides who may call it — the input of the inverse rule
 * (`endpoint-permissions.spec.ts`, docs/25 R2):
 *   `public`      — `@Public` (whatever else it carries);
 *   `roles`       — non-empty `@Roles`, no `@RequirePermission`;
 *   `permissions` — `@RequirePermission`, no `@Roles`;
 *   `both`        — `@RequirePermission` and `@Roles` (a contradiction);
 *   `none`        — any session passes (no or empty `@Roles`, no requirement).
 */
export type RouteGate = 'public' | 'roles' | 'permissions' | 'both' | 'none';

export function routeGate(route: SnapshotRoute): RouteGate {
  const gates = resolveGates(new Reflector(), route);
  if (gates.isPublic) return 'public';
  if (gates.permissionsDeclared) return gates.rolesDeclared ? 'both' : 'permissions';
  return gates.roles.length > 0 ? 'roles' : 'none';
}

/**
 * The live `@RequirePermission` requirement of every route that carries one
 * (catalog permissions, `PERMISSIONS` order). Compared with the B1 plan
 * `ENDPOINT_PERMISSIONS` by `endpoint-permissions.spec.ts`. Malformed
 * requirements are reported by {@link buildRolesSnapshot}, not here.
 */
export function buildPermissionRequirements(
  routes: readonly SnapshotRoute[],
): Readonly<Record<string, readonly Permission[]>> {
  const reflector = new Reflector();
  const entries = new Map<string, readonly Permission[]>();
  for (const route of routes) {
    if (entries.has(route.key)) continue;
    const gates = resolveGates(reflector, route);
    if (gates.permissionsDeclared) entries.set(route.key, gates.permissions);
  }
  return sortedRecord(entries);
}

// ─── Roles snapshot ────────────────────────────────────────

/** Builds the `endpoint-roles` map from live metadata. */
export function buildRolesSnapshot(
  routes: readonly SnapshotRoute[],
): SnapshotResult<EndpointRolesSnapshot> {
  const reflector = new Reflector();
  const entries = new Map<string, EndpointAccess>();
  const contradictions: string[] = [];

  for (const route of routes) {
    const where = routeLabel(route);
    if (entries.has(route.key)) {
      contradictions.push(`${where}: a second handler resolves to the same METHOD /path`);
      continue;
    }
    const gates = resolveGates(reflector, route);
    contradictions.push(...gateContradictions(where, gates));
    entries.set(route.key, accessOf(gates));
  }

  return { snapshot: sortedRecord(entries), contradictions };
}

function gateContradictions(where: string, gates: RouteGates): string[] {
  const out: string[] = [];
  const roles = gates.roles.join(', ');
  const required = gates.permissions.join(', ');
  for (const value of gates.unknownRoles) {
    out.push(`${where}: @Roles carries a value that is not a Role: ${JSON.stringify(value)}`);
  }
  if (gates.isPublic && gates.roles.length > 0) {
    out.push(`${where}: @Public together with @Roles(${roles}) — RolesGuard answers 403 to every caller (no req.user)`);
  }
  if (!gates.permissionsDeclared) return out;

  for (const value of gates.unknownPermissions) {
    out.push(`${where}: @RequirePermission carries a value that is not a Permission: ${JSON.stringify(value)}`);
  }
  if (gates.permissions.length === 0) {
    out.push(`${where}: @RequirePermission without a catalog permission — PermissionsGuard answers 403 to every caller`);
  }
  if (gates.rolesDeclared) {
    out.push(
      `${where}: @Roles(${roles}) together with @RequirePermission(${required}) — a route carries one of the two (docs/25 B2), both guards would apply`,
    );
  }
  if (gates.isPublic) {
    out.push(`${where}: @Public together with @RequirePermission(${required}) — PermissionsGuard lets every caller through, the requirement never applies`);
  }
  return out;
}

/**
 * The access the guards actually enforce. For the contradictory `@Roles` +
 * `@RequirePermission` pair that is the intersection (both guards run).
 */
function accessOf(gates: RouteGates): EndpointAccess {
  if (gates.isPublic) return ACCESS_PUBLIC;
  if (gates.permissionsDeclared) {
    const admitted = rolesSatisfying(gates.permissions, { lider: true });
    if (gates.roles.length === 0) return admitted;
    return admitted.filter((role) => gates.roles.includes(role));
  }
  if (gates.roles.length === 0) return ACCESS_AUTHENTICATED;
  return gates.roles;
}

function isDeclared(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * `@Roles` metadata → known roles in canonical order (deduplicated) + every
 * value that is not a role. `undefined` / `[]` → no roles (= AUTHENTICATED).
 */
function normaliseRoles(declared: unknown): { roles: Role[]; unknown: unknown[] } {
  if (declared === undefined || declared === null) return { roles: [], unknown: [] };
  const values: unknown[] = Array.isArray(declared) ? declared : [declared];
  const known = new Set<string>(ROLE_ORDER);
  const unknown = values.filter((v) => typeof v !== 'string' || !known.has(v));
  const present = new Set(values.filter((v): v is string => typeof v === 'string'));
  return { roles: ROLE_ORDER.filter((r) => present.has(r)), unknown };
}

/**
 * `@RequirePermission` metadata → catalog permissions in `PERMISSIONS` order
 * (deduplicated) + every value that is not one. `undefined` → none.
 */
function normalisePermissions(declared: unknown): { permissions: Permission[]; unknown: unknown[] } {
  if (declared === undefined || declared === null) return { permissions: [], unknown: [] };
  const values: unknown[] = Array.isArray(declared) ? declared : [declared];
  const known = new Set<string>(PERMISSIONS);
  const unknown = values.filter((v) => typeof v !== 'string' || !known.has(v));
  const present = new Set(values.filter((v): v is string => typeof v === 'string'));
  return { permissions: PERMISSIONS.filter((p) => present.has(p)), unknown };
}

// ─── Ownership snapshot ────────────────────────────────────

interface OwnershipKind {
  field: keyof EndpointOwnership;
  decorator: string;
  metadataKey: string;
  guard: Type<CanActivate>;
}

const OWNERSHIP_KINDS: readonly OwnershipKind[] = [
  {
    field: 'carrier',
    decorator: '@CarrierOwns',
    metadataKey: CARRIER_OWNERSHIP_KEY,
    guard: CarrierOwnershipGuard,
  },
  {
    field: 'opiekun',
    decorator: '@OpiekunOwns',
    metadataKey: OPIEKUN_OWNERSHIP_KEY,
    guard: OpiekunOwnershipGuard,
  },
];

/**
 * Builds the `endpoint-ownership` map: for each route, the ownership checks
 * that are really enforced — the decorator's metadata AND its guard in the
 * route's `@UseGuards` chain. A decorator without its guard is inert; it is
 * reported as a contradiction and NOT recorded, so the fixture states what
 * runs, not what is written.
 */
export function buildOwnershipSnapshot(
  routes: readonly SnapshotRoute[],
): SnapshotResult<EndpointOwnershipSnapshot> {
  const reflector = new Reflector();
  const entries = new Map<string, EndpointOwnership>();
  const contradictions: string[] = [];
  const seen = new Set<string>();

  for (const route of routes) {
    if (seen.has(route.key)) continue; // reported by buildRolesSnapshot
    seen.add(route.key);
    const where = routeLabel(route);
    const targets = metadataTargets(route);
    const guards = guardsOf(route);
    const isPublic = Boolean(reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets));
    const entry: { carrier?: OwnershipMeta; opiekun?: OwnershipMeta } = {};

    for (const kind of OWNERSHIP_KINDS) {
      const meta = reflector.getAllAndOverride<OwnershipMeta | undefined>(kind.metadataKey, targets);
      if (!meta) continue;
      if (!guards.has(kind.guard)) {
        contradictions.push(`${where}: ${kind.decorator} without ${kind.guard.name} in @UseGuards — the check never runs`);
        continue;
      }
      if (isPublic) {
        contradictions.push(`${where}: ${kind.decorator} on a @Public route — ${kind.guard.name} answers 403 (no req.user)`);
      }
      entry[kind.field] = canonicalMeta(meta);
    }

    if (entry.carrier || entry.opiekun) entries.set(route.key, entry);
  }

  return { snapshot: sortedRecord(entries), contradictions };
}

/** Fixed key order so the JSON fixture is stable regardless of decorator code. */
function canonicalMeta(meta: OwnershipMeta): OwnershipMeta {
  return { source: meta.source, name: meta.name, as: meta.as };
}

/** Class guards + handler guards, as Nest's `GuardsContextCreator` merges them. */
function guardsOf(route: SnapshotRoute): ReadonlySet<unknown> {
  const onClass: unknown = Reflect.getMetadata(GUARDS_METADATA, route.controllerRef);
  const onHandler: unknown = Reflect.getMetadata(GUARDS_METADATA, route.handlerRef);
  return new Set([...asArray(onClass), ...asArray(onHandler)]);
}

// ─── Fixture I/O helpers (pure) ────────────────────────────

/**
 * One route per line, compact values — a reviewer reads a changed permission
 * as a one-line diff. Output is valid JSON with a trailing newline.
 */
export function formatSnapshot(snapshot: Readonly<Record<string, unknown>>): string {
  const lines = Object.entries(snapshot).map(
    ([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  return lines.length === 0 ? '{}\n' : `{\n${lines.join(',\n')}\n}\n`;
}

/**
 * Line-per-route difference between a committed fixture and the live map:
 *   `+ KEY: value`        — in code, missing from the fixture;
 *   `- KEY: value`        — in the fixture, gone from code;
 *   `~ KEY: old -> new`   — same route, different value.
 * Values are compared by their canonical JSON, so key order inside an
 * ownership entry does not matter.
 */
export function diffSnapshots(
  expected: Readonly<Record<string, unknown>>,
  actual: Readonly<Record<string, unknown>>,
): string[] {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort(byCodeUnit);
  const out: string[] = [];
  for (const key of keys) {
    const inExpected = Object.prototype.hasOwnProperty.call(expected, key);
    const inActual = Object.prototype.hasOwnProperty.call(actual, key);
    const before = stableJson(expected[key]);
    const after = stableJson(actual[key]);
    if (!inExpected) out.push(`+ ${key}: ${after}`);
    else if (!inActual) out.push(`- ${key}: ${before}`);
    else if (before !== after) out.push(`~ ${key}: ${before} -> ${after}`);
  }
  return out;
}

/** Narrows a parsed `endpoint-roles` fixture; throws on a malformed entry. */
export function parseRolesSnapshot(raw: unknown): EndpointRolesSnapshot {
  const record = asRecord(raw, 'endpoint-roles fixture');
  const known = new Set<string>(ROLE_ORDER);
  const out: Record<string, EndpointAccess> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === ACCESS_PUBLIC || value === ACCESS_AUTHENTICATED) {
      out[key] = value;
    } else if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((v): v is Role => typeof v === 'string' && known.has(v))
    ) {
      out[key] = value;
    } else {
      throw new TypeError(`endpoint-roles fixture: bad entry ${key}: ${JSON.stringify(value)}`);
    }
  }
  return out;
}

/** Narrows a parsed `endpoint-ownership` fixture; throws on a malformed entry. */
export function parseOwnershipSnapshot(raw: unknown): EndpointOwnershipSnapshot {
  const record = asRecord(raw, 'endpoint-ownership fixture');
  const out: Record<string, EndpointOwnership> = {};
  for (const [key, value] of Object.entries(record)) {
    const what = `endpoint-ownership fixture entry ${key}`;
    const entry = asRecord(value, what);
    const parsed: { carrier?: OwnershipMeta; opiekun?: OwnershipMeta } = {};
    for (const [field, meta] of Object.entries(entry)) {
      if (field !== 'carrier' && field !== 'opiekun') {
        throw new TypeError(`${what}: unknown guard "${field}"`);
      }
      parsed[field] = parseMeta(meta, `${what}.${field}`);
    }
    out[key] = parsed;
  }
  return out;
}

// `Record<Union, true>` so a new member of the union is a compile error here.
const OWNERSHIP_SOURCES: Readonly<Record<OwnershipSource, true>> = {
  param: true,
  body: true,
  query: true,
};
const OWNERSHIP_TARGETS: Readonly<Record<OwnershipMeta['as'], true>> = {
  carrierId: true,
  vehicleId: true,
  driverId: true,
  trailerId: true,
  claimId: true,
  claimNrZgl: true,
  delegationId: true,
};

function parseMeta(value: unknown, what: string): OwnershipMeta {
  const meta = asRecord(value, what);
  const { source, name, as } = meta;
  if (
    typeof source !== 'string' ||
    !isOwnershipSource(source) ||
    typeof name !== 'string' ||
    typeof as !== 'string' ||
    !isOwnershipTarget(as)
  ) {
    throw new TypeError(`${what}: expected { source, name, as }, got ${JSON.stringify(value)}`);
  }
  return { source, name, as };
}

function isOwnershipSource(value: string): value is OwnershipSource {
  return Object.prototype.hasOwnProperty.call(OWNERSHIP_SOURCES, value);
}

function isOwnershipTarget(value: string): value is OwnershipMeta['as'] {
  return Object.prototype.hasOwnProperty.call(OWNERSHIP_TARGETS, value);
}

// ─── internals ─────────────────────────────────────────────

/** `[handler, class]` — the lookup order of every guard in this codebase. */
function metadataTargets(route: SnapshotRoute): [SnapshotRoute['handlerRef'], Type<unknown>] {
  return [route.handlerRef, route.controllerRef];
}

function routeLabel(route: SnapshotRoute): string {
  return `${route.key} (${route.controller}.${route.handler})`;
}

function sortedRecord<T>(entries: ReadonlyMap<string, T>): Readonly<Record<string, T>> {
  const out: Record<string, T> = {};
  for (const key of [...entries.keys()].sort(byCodeUnit)) {
    out[key] = entries.get(key) as T;
  }
  return out;
}

/** Locale-independent ordering, so every machine writes the same fixture. */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${what}: expected a JSON object`);
  }
  return value as Record<string, unknown>;
}

/** JSON with object keys sorted at every level (arrays keep their order). */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    const source = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort(byCodeUnit)
        .map((k) => [k, source[k]]),
    );
  });
}
