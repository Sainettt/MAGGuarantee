// Track B equivalence and inverse rule (docs/25 §0 «Инвариант», §3 B1, B2, B5).
//
// First block — the committed fixtures only, no Nest module graph. Both are
// kept in sync with the live metadata by `roles-snapshot.spec.ts`:
//   `endpoint-roles.snapshot.json`       — who passed before track B (frozen);
//   `endpoint-permissions.snapshot.json` — what each route requires today
//     (generated since B5; it replaced the hand table `ENDPOINT_PERMISSIONS`).
// The permissions catalog in `@magguarantee/shared`, applied to the second,
// must reproduce the first exactly. Decided rule (2026-10-23): a role counts
// when its LEADER variant satisfies the requirement
// (`rolesSatisfying(…, { lider: true })`), because the pre-track-B gate could
// not express the flag — the planner-transfer decide routes admitted admin and
// planista, and `vehicles.planner_transfer.decide` is held by a planista only
// through `LIDER_PERMISSIONS`.
//
// Second block — the LIVE controller metadata (module graph scanned like
// `roles-snapshot.spec.ts`, no providers booted). `PermissionsGuard` denies by
// default since B5, so the inverse rule (docs/25 R2) is: every non-`@Public`
// route carries `@RequirePermission` or `@AuthenticatedOnly(reason)` with a
// real reason — and never both.

// `AppModule` evaluates `ConfigModule.forRoot({ validate: validateEnv })` at
// import time; the unit-test job has no `.env`. Only the module graph matters
// here — pass the raw env through (same as `roles-snapshot.spec.ts`).
jest.mock('../../config/env.schema', () => ({
  ...jest.requireActual<object>('../../config/env.schema'),
  validateEnv: (raw: Record<string, unknown>): Record<string, unknown> => raw,
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PERMISSIONS,
  isPermission,
  rolesSatisfying,
  type Permission,
  type Role,
} from '@magguarantee/shared';

import { AppModule } from '../../app.module';
import { AUTHENTICATED_ONLY_MIN_REASON_LENGTH } from '../../modules/auth/decorators/authenticated-only.decorator';
import { discoverControllers, listRoutes, type DiscoveredRoute } from '../testing/route-discovery';
import { SERVICE_CAPABILITIES } from './endpoint-permissions';
import {
  ACCESS_AUTHENTICATED,
  ACCESS_PUBLIC,
  authenticatedOnlyReason,
  parsePermissionsSnapshot,
  parseRolesSnapshot,
  routeGate,
  type EndpointPermissionsSnapshot,
  type EndpointRolesSnapshot,
  type RouteGate,
} from './roles-snapshot';

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as unknown;
}

const ROLES: EndpointRolesSnapshot = parseRolesSnapshot(readFixture('endpoint-roles.snapshot.json'));
const REQUIRED: EndpointPermissionsSnapshot = parsePermissionsSnapshot(
  readFixture('endpoint-permissions.snapshot.json'),
);

/** Routes whose pre-track-B role set is reached only with the leader flag counted. */
const LIDER_ONLY_ROUTES: Readonly<Record<string, readonly Role[]>> = {
  'POST /planner-transfers/:id/approve': ['planista'],
  'POST /planner-transfers/:id/reject': ['planista'],
};

/** `[route, permissions]` for every route the permission fixture gates by permission. */
const permissionGated = Object.entries(REQUIRED).filter(
  (entry): entry is [string, readonly Permission[]] => Array.isArray(entry[1]),
);
/** `[route, roles]` for every route the roles fixture records with a role set. */
const roleGated = Object.entries(ROLES).filter(
  (entry): entry is [string, readonly Role[]] => Array.isArray(entry[1]),
);

function keysWith(fixture: Readonly<Record<string, unknown>>, access: string): string[] {
  return Object.entries(fixture)
    .filter(([, value]) => value === access)
    .map(([key]) => key)
    .sort();
}

function show(roles: readonly Role[]): string {
  return `[${roles.join(', ')}]`;
}

describe('permission fixture ⇔ pre-track-B roles fixture (docs/25 B1, B5)', () => {
  // ── same routes, same kind of decision ──

  it('the two fixtures list exactly the same routes', () => {
    expect(Object.keys(REQUIRED).sort()).toEqual(Object.keys(ROLES).sort());
    expect(Object.keys(REQUIRED).length).toBeGreaterThan(100);
  });

  it('PUBLIC and AUTHENTICATED routes coincide; every other route is gated by permission in one and by roles in the other', () => {
    expect(keysWith(REQUIRED, ACCESS_PUBLIC)).toEqual(keysWith(ROLES, ACCESS_PUBLIC));
    expect(keysWith(REQUIRED, ACCESS_AUTHENTICATED)).toEqual(keysWith(ROLES, ACCESS_AUTHENTICATED));
    expect(keysWith(REQUIRED, ACCESS_PUBLIC).length).toBeGreaterThan(0);
    expect(keysWith(REQUIRED, ACCESS_AUTHENTICATED).length).toBeGreaterThan(0);
    expect(permissionGated.map(([key]) => key).sort()).toEqual(roleGated.map(([key]) => key).sort());
  });

  it('every requirement is non-empty, free of duplicates and made of catalog strings', () => {
    const bad = permissionGated
      .filter(
        ([, required]) =>
          required.length === 0 ||
          new Set(required).size !== required.length ||
          !required.every((p) => isPermission(p)),
      )
      .map(([key]) => key);
    expect(bad).toEqual([]);
  });

  // ── the invariant ──

  it('rolesSatisfying(requirement, { lider: true }) reproduces every pre-track-B role set exactly', () => {
    const mismatches = roleGated
      .map(([key, expected]) => {
        const required = REQUIRED[key];
        const actual = Array.isArray(required) ? rolesSatisfying(required, { lider: true }) : [];
        return show(actual) === show(expected)
          ? null
          : `${key}: before track B ${show(expected)} ≠ catalog ${show(actual)}`;
      })
      .filter((line): line is string => line !== null);
    expect(mismatches).toEqual([]);
  });

  it('without the leader flag only the planner-transfer decide routes differ — by planista', () => {
    const lost: Record<string, Role[]> = {};
    for (const [key, expected] of roleGated) {
      const required = REQUIRED[key];
      const plain = new Set(Array.isArray(required) ? rolesSatisfying(required) : []);
      const missing = expected.filter((role) => !plain.has(role));
      const extra = [...plain].filter((role) => !expected.includes(role));
      // The flag only ever adds: dropping it can never widen access.
      expect({ key, extra }).toEqual({ key, extra: [] });
      if (missing.length > 0) lost[key] = missing;
    }
    expect(lost).toEqual(LIDER_ONLY_ROUTES);
  });

  // ── catalog hygiene against the routes ──

  it('every permission guards a route or a service capability — never both, never neither', () => {
    const onRoutes = new Set<Permission>(permissionGated.flatMap(([, required]) => required));
    const inServices = new Set(Object.keys(SERVICE_CAPABILITIES));
    const unused = PERMISSIONS.filter((p) => !onRoutes.has(p) && !inServices.has(p));
    const both = PERMISSIONS.filter((p) => onRoutes.has(p) && inServices.has(p));
    expect(unused).toEqual([]);
    expect(both).toEqual([]);
    expect([...inServices].filter((p) => !isPermission(p))).toEqual([]);
  });
});

// ─── live controller metadata: the inverse rule ────────────

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Fails with the offending lines and what to do as the message — readable in a CI log. */
function expectNone(what: string, lines: readonly string[], hint: readonly string[]): void {
  if (lines.length === 0) return;
  throw new Error(
    [`${what} (${lines.length}):`, ...lines.map((line) => `  ${line}`), '', ...hint].join('\n'),
  );
}

function isRealReason(reason: unknown): boolean {
  return typeof reason === 'string' && reason.trim().length >= AUTHENTICATED_ONLY_MIN_REASON_LENGTH;
}

/** Why a route fails the inverse rule; `null` — it took exactly one decision. */
function undecidedReason(gate: RouteGate, reason: unknown): string | null {
  switch (gate) {
    case 'public':
    case 'permissions':
      return null;
    case 'authenticated':
      return isRealReason(reason)
        ? null
        : `@AuthenticatedOnly needs a reason of at least ${AUTHENTICATED_ONLY_MIN_REASON_LENGTH} characters, got ${JSON.stringify(reason)}`;
    case 'conflict':
      return '@AuthenticatedOnly next to @RequirePermission — keep one of the two';
    case 'none':
      return 'no @RequirePermission and no @AuthenticatedOnly — PermissionsGuard denies every caller';
  }
}

describe('live controller metadata — inverse rule (docs/25 R2, deny by default since B5)', () => {
  let routes: DiscoveredRoute[];

  beforeAll(async () => {
    routes = listRoutes(await discoverControllers(AppModule));
  });

  it('scans the real module graph (a broken scan must not pass vacuously)', () => {
    expect(routes.length).toBeGreaterThan(100);
    // Every route of the committed fixture is served, and nothing else.
    expect(sortedUnique(routes.map((r) => r.key))).toEqual(Object.keys(REQUIRED).sort());
  });

  it('every non-@Public route has @RequirePermission or @AuthenticatedOnly with a reason', () => {
    const undecided = routes
      .map((route) => {
        const reason = undecidedReason(routeGate(route), authenticatedOnlyReason(route));
        return reason === null ? null : `${route.key} (${route.controller}.${route.handler}): ${reason}`;
      })
      .filter((line): line is string => line !== null);
    expectNone('Routes without exactly one authorization decision', undecided, [
      'Gate each with @RequirePermission from the catalog (preferred), or with @AuthenticatedOnly(reason)',
      `saying in at least ${AUTHENTICATED_ONLY_MIN_REASON_LENGTH} characters why any session may call it`,
      '(modules/auth/decorators/authenticated-only.decorator.ts). Then regenerate the fixtures with',
      '`npm run authz:snapshot -w api` and review the diff in common/authz/__fixtures__/.',
    ]);
  });

  it('no route carries both @AuthenticatedOnly and @RequirePermission', () => {
    const both = routes.filter((route) => routeGate(route) === 'conflict').map((route) => route.key);
    expect(both).toEqual([]);
  });

  it('the session-only routes are exactly the AUTHENTICATED entries of the fixture', () => {
    const live = routes.filter((route) => routeGate(route) === 'authenticated').map((route) => route.key);
    expect(sortedUnique(live)).toEqual(keysWith(REQUIRED, ACCESS_AUTHENTICATED));
  });
});
