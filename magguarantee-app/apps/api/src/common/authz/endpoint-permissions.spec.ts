// B1 equivalence (docs/25 §0 «Инвариант», §3 B1): the permissions catalog in
// `@magguarantee/shared` reproduces today's `@Roles` access on every route.
//
// Input is the committed `__fixtures__/endpoint-roles.snapshot.json` (kept in
// sync with live metadata by `roles-snapshot.spec.ts`), so these checks need no
// Nest module graph. Decided rule (2026-10-23): a role counts when its LEADER
// variant satisfies the requirement (`rolesSatisfying(…, { lider: true })`),
// because `@Roles` cannot express the flag — `@Roles('admin', 'planista')` on
// the planner-transfer decide routes is `vehicles.planner_transfer.decide`,
// which a planista holds only through `LIDER_PERMISSIONS`.
//
// B2.0 adds two checks on the LIVE controller metadata (module graph scanned
// like `roles-snapshot.spec.ts`, no providers booted):
//   - every route with `@RequirePermission` carries exactly the set planned in
//     `ENDPOINT_PERMISSIONS` (vacuous until B2a converts the first module);
//   - inverse rule, phase 1 (docs/25 R2): every non-`@Public` route is gated by
//     `@Roles` or `@RequirePermission`, or allowlisted in `AUTHENTICATED_ONLY`
//     with a reason. B2d drops `@Roles` from the accepted gates.

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
import { discoverControllers, listRoutes, type DiscoveredRoute } from '../testing/route-discovery';
import {
  AUTHENTICATED_ONLY,
  ENDPOINT_PERMISSIONS,
  SERVICE_CAPABILITIES,
} from './endpoint-permissions';
import {
  ACCESS_AUTHENTICATED,
  ACCESS_PUBLIC,
  buildPermissionRequirements,
  parseRolesSnapshot,
  routeGate,
  type EndpointRolesSnapshot,
} from './roles-snapshot';

const SNAPSHOT: EndpointRolesSnapshot = parseRolesSnapshot(
  JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', 'endpoint-roles.snapshot.json'), 'utf8'),
  ) as unknown,
);

/** Routes whose `@Roles` set is reached only with the leader flag counted. */
const LIDER_ONLY_ROUTES: Readonly<Record<string, readonly Role[]>> = {
  'POST /planner-transfers/:id/approve': ['planista'],
  'POST /planner-transfers/:id/reject': ['planista'],
};

const roleGated = Object.entries(SNAPSHOT).filter(
  (entry): entry is [string, readonly Role[]] => Array.isArray(entry[1]),
);
const keysWith = (access: string): string[] =>
  Object.entries(SNAPSHOT)
    .filter(([, value]) => value === access)
    .map(([key]) => key)
    .sort();

function show(roles: readonly Role[]): string {
  return `[${roles.join(', ')}]`;
}

describe('endpoint permissions plan ⇔ @Roles snapshot (docs/25 B1)', () => {
  // ── the plan covers the snapshot exactly ──

  it('ENDPOINT_PERMISSIONS lists exactly the role-gated routes of the snapshot', () => {
    const planned = new Set(Object.keys(ENDPOINT_PERMISSIONS));
    const gated = new Set(roleGated.map(([key]) => key));
    expect([...gated].filter((k) => !planned.has(k)).sort()).toEqual([]); // route without a plan
    expect([...planned].filter((k) => !gated.has(k)).sort()).toEqual([]); // plan without a route
  });

  it('AUTHENTICATED_ONLY lists exactly the session-only routes, each with a reason', () => {
    expect(Object.keys(AUTHENTICATED_ONLY).sort()).toEqual(keysWith(ACCESS_AUTHENTICATED));
    for (const [key, reason] of Object.entries(AUTHENTICATED_ONLY)) {
      expect({ key, long: reason.trim().length > 20 }).toEqual({ key, long: true });
    }
  });

  it('no @Public route is planned or allowlisted', () => {
    const publicKeys = keysWith(ACCESS_PUBLIC);
    expect(publicKeys.length).toBeGreaterThan(0);
    const leaked = publicKeys.filter(
      (key) => key in ENDPOINT_PERMISSIONS || key in AUTHENTICATED_ONLY,
    );
    expect(leaked).toEqual([]);
  });

  it('every requirement is non-empty, free of duplicates and made of catalog strings', () => {
    const bad = Object.entries(ENDPOINT_PERMISSIONS)
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

  it('rolesSatisfying(plan, { lider: true }) reproduces every @Roles set exactly', () => {
    const mismatches = roleGated
      .map(([key, expected]) => {
        const actual = rolesSatisfying(ENDPOINT_PERMISSIONS[key] ?? [], { lider: true });
        return show(actual) === show(expected)
          ? null
          : `${key}: @Roles ${show(expected)} ≠ catalog ${show(actual)}`;
      })
      .filter((line): line is string => line !== null);
    expect(mismatches).toEqual([]);
  });

  it('without the leader flag only the planner-transfer decide routes differ — by planista', () => {
    const lost: Record<string, Role[]> = {};
    for (const [key, expected] of roleGated) {
      const plain = new Set(rolesSatisfying(ENDPOINT_PERMISSIONS[key] ?? []));
      const missing = expected.filter((role) => !plain.has(role));
      const extra = [...plain].filter((role) => !expected.includes(role));
      // The flag only ever adds: dropping it can never widen access.
      expect({ key, extra }).toEqual({ key, extra: [] });
      if (missing.length > 0) lost[key] = missing;
    }
    expect(lost).toEqual(LIDER_ONLY_ROUTES);
  });

  // ── catalog hygiene against the plan ──

  it('every permission guards a route or a service capability — never both, never neither', () => {
    const onRoutes = new Set<Permission>(Object.values(ENDPOINT_PERMISSIONS).flat());
    const inServices = new Set(Object.keys(SERVICE_CAPABILITIES));
    const unused = PERMISSIONS.filter((p) => !onRoutes.has(p) && !inServices.has(p));
    const both = PERMISSIONS.filter((p) => onRoutes.has(p) && inServices.has(p));
    expect(unused).toEqual([]);
    expect(both).toEqual([]);
    expect([...inServices].filter((p) => !isPermission(p))).toEqual([]);
  });
});

// ─── B2.0: live @RequirePermission metadata ────────────────

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

describe('live @RequirePermission metadata (docs/25 B2)', () => {
  let routes: DiscoveredRoute[];

  beforeAll(async () => {
    routes = listRoutes(await discoverControllers(AppModule));
  });

  it('scans the real module graph (a broken scan must not pass vacuously)', () => {
    expect(routes.length).toBeGreaterThan(100);
    // Every route of the committed snapshot is served, and nothing else.
    expect(sortedUnique(routes.map((r) => r.key))).toEqual(Object.keys(SNAPSHOT).sort());
  });

  it('every route with live @RequirePermission carries exactly its ENDPOINT_PERMISSIONS set', () => {
    // Vacuous until B2a converts the first controller; from then on a route
    // whose decorator drifts from the plan (or that is not planned) is red.
    const live = buildPermissionRequirements(routes);
    const drift = Object.entries(live)
      .map(([key, required]) => {
        const planned = ENDPOINT_PERMISSIONS[key];
        if (!planned) return `${key}: @RequirePermission(${required.join(', ')}) on a route with no plan`;
        const same = sortedUnique(required).join() === sortedUnique(planned).join();
        return same ? null : `${key}: @RequirePermission(${required.join(', ')}) ≠ plan (${planned.join(', ')})`;
      })
      .filter((line): line is string => line !== null);
    expect(drift).toEqual([]);
  });

  it('inverse rule, phase 1: every non-@Public route has @Roles or @RequirePermission, or is allowlisted', () => {
    const undecided = routes
      .filter((route) => routeGate(route) === 'none' && !(route.key in AUTHENTICATED_ONLY))
      .map((route) => `${route.key} (${route.controller}.${route.handler})`);
    // A new route must take an authorization decision: @RequirePermission from
    // the catalog (preferred), or an AUTHENTICATED_ONLY entry saying why any
    // session may call it.
    expect(undecided).toEqual([]);
  });

  it('every AUTHENTICATED_ONLY entry is a live session-only route (no stale allowlist)', () => {
    const gateByKey = new Map(routes.map((route) => [route.key, routeGate(route)]));
    const stale = Object.keys(AUTHENTICATED_ONLY)
      .filter((key) => gateByKey.get(key) !== 'none')
      .map((key) => `${key}: ${gateByKey.get(key) ?? 'not served'}`);
    expect(stale).toEqual([]);
  });

  it('no route carries both @Roles and @RequirePermission', () => {
    const both = routes.filter((route) => routeGate(route) === 'both').map((route) => route.key);
    expect(both).toEqual([]);
  });
});
