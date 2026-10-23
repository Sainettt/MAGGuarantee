// Unit tests for the pure snapshot builders (`roles-snapshot.ts`).
//
// The live AppModule has no contradictory metadata, so `roles-snapshot.spec.ts`
// alone would never exercise the contradiction branches. Synthetic controllers
// here pin the resolution rules (handler wins over class, role order, the
// leader rule, guard + decorator pairing), the three decisions a route can
// take since docs/25 B5 (`@Public`, `@AuthenticatedOnly`, `@RequirePermission`),
// the contradictions — above all "no decision", which is never recorded — and
// the fixture helpers.

import { Controller, Delete, Get, Patch, Post, Put, SetMetadata, UseGuards } from '@nestjs/common';

import { rolesSatisfying } from '@magguarantee/shared';

import { PERMISSIONS_METADATA_KEY } from '../../modules/auth/auth.constants';
import { AuthenticatedOnly } from '../../modules/auth/decorators/authenticated-only.decorator';
import { Public } from '../../modules/auth/decorators/public.decorator';
import { RequirePermission } from '../../modules/auth/decorators/require-permission.decorator';
import { CarrierOwnershipGuard, CarrierOwns, OpiekunOwnershipGuard, OpiekunOwns } from '../guards';
import { listRoutes } from '../testing/route-discovery';
import {
  ACCESS_AUTHENTICATED,
  ACCESS_PUBLIC,
  authenticatedOnlyReason,
  buildOwnershipSnapshot,
  buildPermissionRequirements,
  buildRolesSnapshot,
  diffSnapshots,
  formatSnapshot,
  parseOwnershipSnapshot,
  parsePermissionsSnapshot,
  parseRolesSnapshot,
  routeGate,
} from './roles-snapshot';

const CLASS_REASON = 'Class-level reason that covers every handler here.';
const HANDLER_REASON = 'Handler-level reason, which wins over the class one.';

@Controller('things')
@RequirePermission('carriers.read')
class ThingsController {
  @Get()
  list(): void {}

  // Handler wins over class; any-of, out of catalog order, with a duplicate.
  @Patch(':id')
  @RequirePermission('users.manage', 'km.verify', 'users.manage')
  patch(): void {}

  // The leader rule: a planista counts because `permissionsFor('planista', true)`
  // holds the requirement — exactly how the B1 fixture records the decide routes.
  @Post(':id/approve')
  @RequirePermission('vehicles.planner_transfer.decide')
  decide(): void {}

  // Contradiction: the class requirement reaches a @Public handler.
  @Post()
  @Public()
  publicButGated(): void {}

  /** Not a route — no verb decorator. */
  helper(): void {}
}

@Controller('open')
@Public()
class OpenController {
  @Get()
  ping(): void {}
}

@Controller('session')
@AuthenticatedOnly(CLASS_REASON)
class SessionController {
  @Get()
  inherits(): void {}

  @Get(':id')
  @AuthenticatedOnly(HANDLER_REASON)
  own(): void {}
}

@Controller('owned')
@UseGuards(OpiekunOwnershipGuard)
class OwnedController {
  @Get(':id')
  @RequirePermission('carriers.read')
  @OpiekunOwns('id', 'param', 'carrierId')
  byClassGuard(): void {}

  // Contradiction: no CarrierOwnershipGuard anywhere on this route.
  @Put(':id')
  @RequirePermission('panel.carrier')
  @CarrierOwns('id')
  inert(): void {}

  @Delete(':id')
  @RequirePermission('fleet.write')
  @UseGuards(CarrierOwnershipGuard)
  @CarrierOwns('vehicleId', 'body')
  @OpiekunOwns('vehicleId', 'body', 'vehicleId')
  both(): void {}

  @Post()
  @RequirePermission('users.manage')
  noOwnership(): void {}
}

const routes = listRoutes([ThingsController, OpenController, SessionController, OwnedController]);

describe('buildRolesSnapshot', () => {
  const { snapshot, contradictions } = buildRolesSnapshot(routes);

  it('records rolesSatisfying(required, { lider: true }) in RoleSchema order, handler over class', () => {
    expect(snapshot).toEqual({
      'DELETE /owned/:id': ['admin', 'opiekun'],
      'GET /open': ACCESS_PUBLIC,
      'GET /owned/:id': ['admin', 'opiekun'],
      'GET /session': ACCESS_AUTHENTICATED,
      'GET /session/:id': ACCESS_AUTHENTICATED,
      'GET /things': ['admin', 'opiekun'],
      'PATCH /things/:id': ['admin', 'weryfikator'],
      'POST /owned': ['admin'],
      'POST /things': ACCESS_PUBLIC,
      'POST /things/:id/approve': ['admin', 'planista'],
      'PUT /owned/:id': ['przewoznik'],
    });
    // Same derivation as the equivalence spec, not a hand-kept list.
    expect(snapshot['POST /things/:id/approve']).toEqual(
      rolesSatisfying(['vehicles.planner_transfer.decide'], { lider: true }),
    );
    expect(rolesSatisfying(['vehicles.planner_transfer.decide'])).toEqual(['admin']);
  });

  it('emits keys sorted by code unit', () => {
    const keys = Object.keys(snapshot);
    expect(keys).toEqual([...keys].sort());
  });

  it('flags @Public + @RequirePermission and records the route as PUBLIC (what the guard does)', () => {
    expect(contradictions).toEqual([
      expect.stringContaining(
        'POST /things (ThingsController.publicButGated): @Public together with @RequirePermission(carriers.read)',
      ),
    ]);
  });

  it('flags a duplicate METHOD /path and a value that is not a permission', () => {
    const [first] = routes;
    if (!first) throw new TypeError('no synthetic routes discovered');
    const bogus = { ...first, key: 'GET /bogus', handler: 'bogus', handlerRef: bogusHandler };
    const result = buildRolesSnapshot([first, first, bogus]);
    expect(result.contradictions).toEqual([
      expect.stringContaining('a second handler resolves to the same METHOD /path'),
      expect.stringContaining('@RequirePermission carries a value that is not a Permission: "root.everything"'),
    ]);
    expect(result.snapshot['GET /bogus']).toEqual(['admin']);
  });
});

function bogusHandler(): void {}
Reflect.defineMetadata(PERMISSIONS_METADATA_KEY, ['users.manage', 'root.everything'], bogusHandler);

describe('buildOwnershipSnapshot', () => {
  const { snapshot, contradictions } = buildOwnershipSnapshot(routes);

  it('records only ownership checks that really run (decorator + guard), with their arguments', () => {
    expect(snapshot).toEqual({
      'DELETE /owned/:id': {
        carrier: { source: 'body', name: 'vehicleId', as: 'vehicleId' },
        opiekun: { source: 'body', name: 'vehicleId', as: 'vehicleId' },
      },
      'GET /owned/:id': { opiekun: { source: 'param', name: 'id', as: 'carrierId' } },
    });
  });

  it('flags a decorator whose guard is missing from @UseGuards', () => {
    expect(contradictions).toEqual([
      expect.stringContaining('PUT /owned/:id (OwnedController.inert): @CarrierOwns without CarrierOwnershipGuard'),
    ]);
  });
});

describe('buildPermissionRequirements', () => {
  it('records every decision — PUBLIC, AUTHENTICATED or the permissions in catalog order, deduplicated', () => {
    expect(buildPermissionRequirements(routes)).toEqual({
      'DELETE /owned/:id': ['fleet.write'],
      'GET /open': ACCESS_PUBLIC,
      'GET /owned/:id': ['carriers.read'],
      'GET /session': ACCESS_AUTHENTICATED,
      'GET /session/:id': ACCESS_AUTHENTICATED,
      'GET /things': ['carriers.read'],
      'PATCH /things/:id': ['km.verify', 'users.manage'],
      'POST /owned': ['users.manage'],
      'POST /things': ACCESS_PUBLIC,
      'POST /things/:id/approve': ['vehicles.planner_transfer.decide'],
      'PUT /owned/:id': ['panel.carrier'],
    });
  });

  it('records the same routes as buildRolesSnapshot, in the same order', () => {
    expect(Object.keys(buildPermissionRequirements(routes))).toEqual(
      Object.keys(buildRolesSnapshot(routes).snapshot),
    );
  });
});

// ─── contradictions ────────────────────────────────────────

@Controller('bad')
class ContradictionsController {
  // Deny by default: no decision at all. Never recorded.
  @Get('undecided')
  undecided(): void {}

  // Two decisions on one route.
  @Delete(':id')
  @AuthenticatedOnly(HANDLER_REASON)
  @RequirePermission('claims.verify')
  both(): void {}

  // PermissionsGuard lets @Public through, the requirement is dead.
  @Post()
  @Public()
  @RequirePermission('users.manage')
  publicWithRequirement(): void {}

  // …and the session requirement is dead too.
  @Put()
  @Public()
  @AuthenticatedOnly(HANDLER_REASON)
  publicAndSession(): void {}

  // Contradictions only raw metadata can produce (the typed decorator forbids them).
  @Get('empty')
  @SetMetadata(PERMISSIONS_METADATA_KEY, [])
  empty(): void {}

  @Get('unknown')
  @SetMetadata(PERMISSIONS_METADATA_KEY, ['users.manage', 'root.everything'])
  unknownPermission(): void {}
}

@Controller('bad-class')
@AuthenticatedOnly(CLASS_REASON)
class ClassSessionHandlerPermController {
  // Across levels: a class @AuthenticatedOnly reaches a handler requirement.
  // The guard checks @AuthenticatedOnly first — the requirement never applies.
  @Get()
  @RequirePermission('claims.read')
  mixed(): void {}

  @Get('plain')
  plain(): void {}
}

@Controller('bad-perm-class')
@RequirePermission('users.manage')
class ClassPermHandlerSessionController {
  // The reverse: a handler @AuthenticatedOnly under a class requirement.
  @Get()
  @AuthenticatedOnly(HANDLER_REASON)
  session(): void {}
}

const badRoutes = listRoutes([
  ContradictionsController,
  ClassSessionHandlerPermController,
  ClassPermHandlerSessionController,
]);

describe('buildRolesSnapshot — contradictions', () => {
  const { snapshot, contradictions } = buildRolesSnapshot(badRoutes);

  it('a route without any decision is a contradiction and is NEVER recorded (not even as AUTHENTICATED)', () => {
    expect(contradictions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'GET /bad/undecided (ContradictionsController.undecided): no @Public, @AuthenticatedOnly or @RequirePermission — PermissionsGuard denies every caller',
        ),
      ]),
    );
    expect('GET /bad/undecided' in snapshot).toBe(false);
    expect('GET /bad/undecided' in buildPermissionRequirements(badRoutes)).toBe(false);
  });

  it('flags @AuthenticatedOnly + @RequirePermission (same level and both directions across levels), recorded as AUTHENTICATED', () => {
    expect(contradictions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'DELETE /bad/:id (ContradictionsController.both): @AuthenticatedOnly together with @RequirePermission(claims.verify)',
        ),
        expect.stringContaining(
          'GET /bad-class (ClassSessionHandlerPermController.mixed): @AuthenticatedOnly together with @RequirePermission(claims.read)',
        ),
        expect.stringContaining(
          'GET /bad-perm-class (ClassPermHandlerSessionController.session): @AuthenticatedOnly together with @RequirePermission(users.manage)',
        ),
      ]),
    );
    expect(snapshot['DELETE /bad/:id']).toBe(ACCESS_AUTHENTICATED);
    expect(snapshot['GET /bad-class']).toBe(ACCESS_AUTHENTICATED);
    expect(snapshot['GET /bad-perm-class']).toBe(ACCESS_AUTHENTICATED);
    // A plain handler under the class @AuthenticatedOnly is not a contradiction.
    expect(snapshot['GET /bad-class/plain']).toBe(ACCESS_AUTHENTICATED);
  });

  it('flags @Public next to @RequirePermission or @AuthenticatedOnly, recorded as PUBLIC', () => {
    expect(contradictions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'POST /bad (ContradictionsController.publicWithRequirement): @Public together with @RequirePermission(users.manage)',
        ),
        expect.stringContaining(
          'PUT /bad (ContradictionsController.publicAndSession): @Public together with @AuthenticatedOnly',
        ),
      ]),
    );
    expect(snapshot['POST /bad']).toBe(ACCESS_PUBLIC);
    expect(snapshot['PUT /bad']).toBe(ACCESS_PUBLIC);
  });

  it('flags an empty and a non-catalog requirement; an empty one is never recorded as AUTHENTICATED', () => {
    expect(contradictions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('GET /bad/empty (ContradictionsController.empty): @RequirePermission without a catalog permission'),
        expect.stringContaining(
          'GET /bad/unknown (ContradictionsController.unknownPermission): @RequirePermission carries a value that is not a Permission: "root.everything"',
        ),
      ]),
    );
    expect(snapshot['GET /bad/empty']).toEqual([]);
    expect(snapshot['GET /bad/unknown']).toEqual(['admin']);
    // `[]` cannot be committed: both fixture parsers reject it.
    expect(() => parseRolesSnapshot({ 'GET /bad/empty': [] })).toThrow(TypeError);
    expect(() => parsePermissionsSnapshot({ 'GET /bad/empty': [] })).toThrow(TypeError);
  });

  it('reports exactly those eight contradictions, nothing else', () => {
    expect(contradictions).toHaveLength(8);
  });

  it('the permission map keeps malformed requirements visible (empty / catalog part only)', () => {
    const live = buildPermissionRequirements(badRoutes);
    expect(live['GET /bad/empty']).toEqual([]);
    expect(live['GET /bad/unknown']).toEqual(['users.manage']);
    expect(live['DELETE /bad/:id']).toBe(ACCESS_AUTHENTICATED);
    expect(live['POST /bad']).toBe(ACCESS_PUBLIC);
  });
});

describe('routeGate / authenticatedOnlyReason', () => {
  const find = (key: string): (typeof routes)[number] => {
    const route = [...routes, ...badRoutes].find((r) => r.key === key);
    if (!route) throw new TypeError(`no synthetic route ${key}`);
    return route;
  };

  it('classifies every kind of authorization decision', () => {
    expect(routeGate(find('GET /open'))).toBe('public');
    expect(routeGate(find('POST /things'))).toBe('public');
    expect(routeGate(find('POST /bad'))).toBe('public');
    expect(routeGate(find('PUT /bad'))).toBe('public');
    expect(routeGate(find('GET /session'))).toBe('authenticated');
    expect(routeGate(find('GET /session/:id'))).toBe('authenticated');
    expect(routeGate(find('GET /things'))).toBe('permissions');
    expect(routeGate(find('PATCH /things/:id'))).toBe('permissions');
    expect(routeGate(find('DELETE /bad/:id'))).toBe('conflict');
    expect(routeGate(find('GET /bad-class'))).toBe('conflict');
    expect(routeGate(find('GET /bad-perm-class'))).toBe('conflict');
    expect(routeGate(find('GET /bad/undecided'))).toBe('none');
  });

  it('reads the @AuthenticatedOnly reason handler over class, undefined without one', () => {
    expect(authenticatedOnlyReason(find('GET /session'))).toBe(CLASS_REASON);
    expect(authenticatedOnlyReason(find('GET /session/:id'))).toBe(HANDLER_REASON);
    expect(authenticatedOnlyReason(find('GET /things'))).toBeUndefined();
    expect(authenticatedOnlyReason(find('GET /bad/undecided'))).toBeUndefined();
  });
});

// ─── fixture helpers ───────────────────────────────────────

describe('fixture helpers', () => {
  it('formatSnapshot writes one route per line and round-trips through JSON', () => {
    const text = formatSnapshot({ 'GET /a': ['admin'], 'GET /b': ACCESS_PUBLIC });
    expect(text).toBe('{\n  "GET /a": ["admin"],\n  "GET /b": "PUBLIC"\n}\n');
    expect(JSON.parse(text)).toEqual({ 'GET /a': ['admin'], 'GET /b': 'PUBLIC' });
    expect(formatSnapshot({})).toBe('{}\n');
  });

  it('diffSnapshots reports added, removed and changed routes; ignores key order inside values', () => {
    const before = {
      'GET /same': { opiekun: { source: 'param', name: 'id', as: 'carrierId' } },
      'GET /gone': ['admin'],
      'GET /changed': ['admin', 'opiekun'],
    };
    const after = {
      'GET /same': { opiekun: { as: 'carrierId', name: 'id', source: 'param' } },
      'GET /changed': ['admin'],
      'GET /new': ACCESS_AUTHENTICATED,
    };
    expect(diffSnapshots(before, after)).toEqual([
      '~ GET /changed: ["admin","opiekun"] -> ["admin"]',
      '- GET /gone: ["admin"]',
      '+ GET /new: "AUTHENTICATED"',
    ]);
  });

  it('parseRolesSnapshot rejects malformed entries', () => {
    expect(parseRolesSnapshot({ 'GET /a': ['admin'], 'GET /b': 'PUBLIC' })).toEqual({
      'GET /a': ['admin'],
      'GET /b': 'PUBLIC',
    });
    for (const bad of [[], 'x', { 'GET /a': [] }, { 'GET /a': ['root'] }, { 'GET /a': 'ANYONE' }]) {
      expect(() => parseRolesSnapshot(bad)).toThrow(TypeError);
    }
  });

  it('parsePermissionsSnapshot rejects empty, duplicate and non-catalog requirements', () => {
    const ok = { 'GET /a': ['claims.read', 'claims.verify'], 'GET /b': 'PUBLIC', 'GET /c': 'AUTHENTICATED' };
    expect(parsePermissionsSnapshot(ok)).toEqual(ok);
    for (const bad of [
      [],
      'x',
      { 'GET /a': [] },
      { 'GET /a': ['claims.read', 'claims.read'] },
      { 'GET /a': ['root.everything'] },
      { 'GET /a': ['admin'] },
      { 'GET /a': 'ANYONE' },
    ]) {
      expect(() => parsePermissionsSnapshot(bad)).toThrow(TypeError);
    }
  });

  it('parseOwnershipSnapshot rejects unknown guards and incomplete arguments', () => {
    const ok = { 'GET /a': { carrier: { source: 'param', name: 'id', as: 'vehicleId' } } };
    expect(parseOwnershipSnapshot(ok)).toEqual(ok);
    for (const bad of [
      { 'GET /a': { team: { source: 'param', name: 'id', as: 'vehicleId' } } },
      { 'GET /a': { carrier: { source: 'cookie', name: 'id', as: 'vehicleId' } } },
      { 'GET /a': { carrier: { source: 'param', as: 'vehicleId' } } },
      { 'GET /a': { carrier: { source: 'param', name: 'id', as: 'userId' } } },
    ]) {
      expect(() => parseOwnershipSnapshot(bad)).toThrow(TypeError);
    }
  });
});
