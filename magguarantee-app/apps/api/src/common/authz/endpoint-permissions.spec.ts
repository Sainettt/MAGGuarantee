// B1 equivalence (docs/25 §0 «Инвариант», §3 B1): the permissions catalog in
// `@magguarantee/shared` reproduces today's `@Roles` access on every route.
//
// Input is the committed `__fixtures__/endpoint-roles.snapshot.json` (kept in
// sync with live metadata by `roles-snapshot.spec.ts`), so this spec needs no
// Nest module graph. Decided rule (2026-10-23): a role counts when its LEADER
// variant satisfies the requirement (`rolesSatisfying(…, { lider: true })`),
// because `@Roles` cannot express the flag — `@Roles('admin', 'planista')` on
// the planner-transfer decide routes is `vehicles.planner_transfer.decide`,
// which a planista holds only through `LIDER_PERMISSIONS`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PERMISSIONS,
  isPermission,
  rolesSatisfying,
  type Permission,
  type Role,
} from '@magguarantee/shared';

import {
  AUTHENTICATED_ONLY,
  ENDPOINT_PERMISSIONS,
  SERVICE_CAPABILITIES,
} from './endpoint-permissions';
import {
  ACCESS_AUTHENTICATED,
  ACCESS_PUBLIC,
  parseRolesSnapshot,
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
