// Authorization snapshot (docs/25 §3 B1, B5, risk R1).
//
// Reads the live `@Public` / `@AuthenticatedOnly` / `@RequirePermission` /
// `@OpiekunOwns` / `@CarrierOwns` / `@UseGuards` metadata of every controller
// registered in `AppModule` and compares it with the three committed fixtures:
//   __fixtures__/endpoint-roles.snapshot.json       — who passes the gate
//   __fixtures__/endpoint-ownership.snapshot.json   — which ownership guards run
//   __fixtures__/endpoint-permissions.snapshot.json — what each route requires
// Any widening, narrowing, new route or dropped ownership guard is a red test
// with a line-per-route diff. Track B kept the roles and ownership fixtures
// byte-for-byte since B1; a deliberate access change updates them in its own
// PR together with docs/03 (docs/25 §0 «Не цель»). The permission fixture
// (B5) is the generated successor of the B1–B4 hand table: a new route or a
// changed requirement is reviewed as a one-line diff there.
//
// Regenerate (writes all three fixtures, then the comparisons pass trivially):
//   npm run authz:snapshot -w api
// which runs this file with AUTHZ_SNAPSHOT_UPDATE=1.

// `AppModule` evaluates `ConfigModule.forRoot({ validate: validateEnv })` at
// import time; the unit-test CI job has no `.env`, so the real validator would
// reject. Only the module graph matters here — pass the raw env through
// (same as `common/audit/audit-coverage.inverse.spec.ts`).
jest.mock('../../config/env.schema', () => ({
  ...jest.requireActual<object>('../../config/env.schema'),
  validateEnv: (raw: Record<string, unknown>): Record<string, unknown> => raw,
}));

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Type } from '@nestjs/common';

import { AppModule } from '../../app.module';
import {
  controllersOnDisk,
  discoverControllers,
  listRoutes,
  type DiscoveredRoute,
} from '../testing/route-discovery';
import {
  ACCESS_AUTHENTICATED,
  ACCESS_PUBLIC,
  buildOwnershipSnapshot,
  buildPermissionRequirements,
  buildRolesSnapshot,
  diffSnapshots,
  formatSnapshot,
  parseOwnershipSnapshot,
  parsePermissionsSnapshot,
  parseRolesSnapshot,
  type EndpointOwnershipSnapshot,
  type EndpointPermissionsSnapshot,
  type EndpointRolesSnapshot,
} from './roles-snapshot';

const FIXTURES_DIR = join(__dirname, '__fixtures__');
const ROLES_FIXTURE = join(FIXTURES_DIR, 'endpoint-roles.snapshot.json');
const OWNERSHIP_FIXTURE = join(FIXTURES_DIR, 'endpoint-ownership.snapshot.json');
const PERMISSIONS_FIXTURE = join(FIXTURES_DIR, 'endpoint-permissions.snapshot.json');
const UPDATE = process.env.AUTHZ_SNAPSHOT_UPDATE === '1';
const UPDATE_HINT = 'npm run authz:snapshot -w api';

/** Fails with the diff itself as the message — readable in a CI log. */
function expectNoDrift(fixture: string, diff: readonly string[]): void {
  if (diff.length === 0) return;
  throw new Error(
    [
      `${fixture} differs from the live controller metadata (${diff.length} route(s)):`,
      ...diff.map((line) => `  ${line}`),
      '',
      '  + in code, not in the fixture   - in the fixture, gone from code   ~ changed',
      `If the access change is intended, regenerate with \`${UPDATE_HINT}\`, commit the`,
      'fixture and update docs/03-roles.md in the same PR. Track B refactors must NOT change it.',
    ].join('\n'),
  );
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

describe('authorization snapshot (docs/25 B1, B5)', () => {
  let controllers: Array<Type<unknown>>;
  let routes: DiscoveredRoute[];
  let liveRoles: EndpointRolesSnapshot;
  let liveOwnership: EndpointOwnershipSnapshot;
  let livePermissions: EndpointPermissionsSnapshot;
  let contradictions: string[];

  beforeAll(async () => {
    controllers = await discoverControllers(AppModule);
    routes = listRoutes(controllers);
    const roles = buildRolesSnapshot(routes);
    const ownership = buildOwnershipSnapshot(routes);
    liveRoles = roles.snapshot;
    liveOwnership = ownership.snapshot;
    livePermissions = buildPermissionRequirements(routes);
    contradictions = [...roles.contradictions, ...ownership.contradictions];

    if (UPDATE) {
      writeFileSync(ROLES_FIXTURE, formatSnapshot(liveRoles), 'utf8');
      writeFileSync(OWNERSHIP_FIXTURE, formatSnapshot(liveOwnership), 'utf8');
      writeFileSync(PERMISSIONS_FIXTURE, formatSnapshot(livePermissions), 'utf8');
    }
  });

  // ── discovery sanity: a broken scan must not pass vacuously ──

  it('discovers every @Controller class that exists under src/', () => {
    const registered = new Set(controllers);
    const missing = controllersOnDisk(join(__dirname, '..', '..'))
      .filter((c) => !registered.has(c))
      .map((c) => c.name);
    expect(missing).toEqual([]);
    expect(controllers.length).toBeGreaterThanOrEqual(20);
  });

  it('every discovered route is in both gate snapshots exactly once', () => {
    // A route without an authorization decision is never recorded, so it
    // shows up here as missing (and as a contradiction below).
    const keys = routes.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(liveRoles).sort()).toEqual([...keys].sort());
    expect(Object.keys(livePermissions).sort()).toEqual([...keys].sort());
    expect(keys.length).toBeGreaterThan(100);
  });

  it('knows the three access kinds (sanity check on metadata resolution)', () => {
    expect(liveRoles['POST /auth/login']).toBe(ACCESS_PUBLIC);
    expect(liveRoles['GET /auth/me']).toBe(ACCESS_AUTHENTICATED);
    // Class-level @RequirePermission is inherited by the handler (getAllAndOverride).
    expect(liveRoles['GET /users']).toEqual(['admin']);
    expect(livePermissions['POST /auth/login']).toBe(ACCESS_PUBLIC);
    expect(livePermissions['GET /auth/me']).toBe(ACCESS_AUTHENTICATED);
    expect(livePermissions['GET /users']).toEqual(['users.manage']);
  });

  // ── the contract ──

  it('no contradictory metadata (e.g. a route without a decision, ownership decorator without its guard)', () => {
    expect(contradictions).toEqual([]);
  });

  it('endpoint-roles.snapshot.json matches the live @Public / @AuthenticatedOnly / @RequirePermission metadata', () => {
    const fixture = parseRolesSnapshot(readJson(ROLES_FIXTURE));
    expectNoDrift('endpoint-roles.snapshot.json', diffSnapshots(fixture, liveRoles));
  });

  it('endpoint-permissions.snapshot.json matches the live @Public / @AuthenticatedOnly / @RequirePermission metadata', () => {
    const fixture = parsePermissionsSnapshot(readJson(PERMISSIONS_FIXTURE));
    expectNoDrift('endpoint-permissions.snapshot.json', diffSnapshots(fixture, livePermissions));
  });

  it('endpoint-ownership.snapshot.json matches the live @OpiekunOwns / @CarrierOwns guards', () => {
    const fixture = parseOwnershipSnapshot(readJson(OWNERSHIP_FIXTURE));
    expectNoDrift('endpoint-ownership.snapshot.json', diffSnapshots(fixture, liveOwnership));
  });

  it('every ownership entry names a route that exists', () => {
    const unknownRoutes = Object.keys(liveOwnership).filter((key) => !(key in liveRoles));
    expect(unknownRoutes).toEqual([]);
  });
});
