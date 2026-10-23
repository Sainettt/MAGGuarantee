// B1 equivalence (docs/25 §0 «Инвариант», §3 B1): the permissions catalog in
// `@magguarantee/shared` reproduces, on every route, the `@Roles` access that
// was live before track B.
//
// Input is the committed `__fixtures__/endpoint-roles.snapshot.json` (kept in
// sync with live metadata by `roles-snapshot.spec.ts`), so these checks need no
// Nest module graph. Decided rule (2026-10-23): a role counts when its LEADER
// variant satisfies the requirement (`rolesSatisfying(…, { lider: true })`),
// because `@Roles` cannot express the flag — `@Roles('admin', 'planista')` on
// the planner-transfer decide routes is `vehicles.planner_transfer.decide`,
// which a planista holds only through `LIDER_PERMISSIONS`.
//
// The second block reads the LIVE controller metadata (module graph scanned
// like `roles-snapshot.spec.ts`, no providers booted). B2 is complete, so since
// B2d:
//   - the live `@RequirePermission` set equals `ENDPOINT_PERMISSIONS`, route for
//     route, in both directions;
//   - inverse rule, phase 2 (docs/25 R2): every non-`@Public` route carries
//     `@RequirePermission` or is allowlisted in `AUTHENTICATED_ONLY` with a
//     reason — `@Roles` is no longer an authorization decision;
//   - no live controller class or route handler carries `@Roles` metadata at
//     all. `RolesGuard` stays registered until B5 and, with nothing to read,
//     lets every request through.

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
  rolesMetadataSites,
  routeGate,
  type EndpointRolesSnapshot,
  type RouteGate,
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

// ─── B2: live controller metadata ──────────────────────────

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

/** Why a route fails the phase-2 inverse rule; `null` — it took a decision. */
function undecidedReason(gate: RouteGate, allowlisted: boolean): string | null {
  switch (gate) {
    case 'public':
    case 'permissions':
      return null;
    case 'none':
      return allowlisted ? null : 'no @RequirePermission and not in AUTHENTICATED_ONLY';
    case 'roles':
      return '@Roles only — not an authorization decision since docs/25 B2d';
    case 'both':
      return '@Roles next to @RequirePermission — drop the @Roles';
  }
}

describe('live controller metadata (docs/25 B2, phase 2 since B2d)', () => {
  let routes: DiscoveredRoute[];

  beforeAll(async () => {
    routes = listRoutes(await discoverControllers(AppModule));
  });

  it('scans the real module graph (a broken scan must not pass vacuously)', () => {
    expect(routes.length).toBeGreaterThan(100);
    // Every route of the committed snapshot is served, and nothing else.
    expect(sortedUnique(routes.map((r) => r.key))).toEqual(Object.keys(SNAPSHOT).sort());
  });

  it('the live @RequirePermission set equals ENDPOINT_PERMISSIONS, route for route', () => {
    // Both directions: a route whose decorator drifts from the plan, a route
    // that is not planned, and a planned route that lost its decorator are red.
    const live = buildPermissionRequirements(routes);
    const keys = sortedUnique([...Object.keys(live), ...Object.keys(ENDPOINT_PERMISSIONS)]);
    const drift = keys
      .map((key) => {
        const required = live[key];
        const planned = ENDPOINT_PERMISSIONS[key];
        if (!planned) return `${key}: @RequirePermission(${(required ?? []).join(', ')}) on a route with no plan`;
        if (!required) return `${key}: planned (${planned.join(', ')}) but carries no @RequirePermission`;
        const same = sortedUnique(required).join() === sortedUnique(planned).join();
        return same ? null : `${key}: @RequirePermission(${required.join(', ')}) ≠ plan (${planned.join(', ')})`;
      })
      .filter((line): line is string => line !== null);
    expect(drift).toEqual([]);
  });

  it('inverse rule, phase 2: every non-@Public route has @RequirePermission or is allowlisted — @Roles does not count', () => {
    const undecided = routes
      .map((route) => {
        const reason = undecidedReason(routeGate(route), route.key in AUTHENTICATED_ONLY);
        return reason === null ? null : `${route.key} (${route.controller}.${route.handler}): ${reason}`;
      })
      .filter((line): line is string => line !== null);
    expectNone('Routes without an authorization decision', undecided, [
      'Gate each with @RequirePermission from the catalog (preferred; plan it in ENDPOINT_PERMISSIONS), or add',
      'an AUTHENTICATED_ONLY entry saying why any session may call it (common/authz/endpoint-permissions.ts).',
    ]);
  });

  it('no live controller class or route handler carries @Roles metadata', () => {
    // Raw metadata on both levels: an empty @Roles() and a class @Roles hidden
    // behind handler metadata are leftovers too.
    expectNone('@Roles metadata on live controllers', rolesMetadataSites(routes), [
      '@Roles is not an authorization decision since docs/25 B2d: RolesGuard stays registered only until B5',
      'deletes it. Gate the route with @RequirePermission(...ENDPOINT_PERMISSIONS[route]) instead. The synthetic',
      'controllers in common/authz/snapshot-builders.spec.ts are the only allowed users of @Roles.',
    ]);
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
