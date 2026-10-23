// Unit tests for the pure snapshot builders (`roles-snapshot.ts`).
//
// The live AppModule has no contradictory metadata, so `roles-snapshot.spec.ts`
// alone would never exercise the contradiction branches. Synthetic controllers
// here pin the resolution rules (handler wins over class, empty `@Roles()` =
// any session, role order, guard + decorator pairing) and the fixture helpers.
// B2.0 adds `@RequirePermission`: a permission-only route, the
// both-decorators and `@Public` contradictions, malformed requirements.

import { Controller, Delete, Get, Patch, Post, Put, SetMetadata, UseGuards } from '@nestjs/common';

import { rolesSatisfying } from '@magguarantee/shared';

import { PERMISSIONS_METADATA_KEY } from '../../modules/auth/auth.constants';
import { Public } from '../../modules/auth/decorators/public.decorator';
import { RequirePermission } from '../../modules/auth/decorators/require-permission.decorator';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { CarrierOwnershipGuard, CarrierOwns, OpiekunOwnershipGuard, OpiekunOwns } from '../guards';
import { listRoutes } from '../testing/route-discovery';
import {
  ACCESS_AUTHENTICATED,
  ACCESS_PUBLIC,
  buildOwnershipSnapshot,
  buildPermissionRequirements,
  buildRolesSnapshot,
  diffSnapshots,
  formatSnapshot,
  parseOwnershipSnapshot,
  parseRolesSnapshot,
  routeGate,
} from './roles-snapshot';

@Controller('things')
@Roles('opiekun', 'admin')
class ThingsController {
  @Get()
  list(): void {}

  @Get(':id')
  @Roles()
  open(): void {}

  @Patch(':id')
  @Roles('weryfikator', 'admin', 'admin')
  patch(): void {}

  // Contradiction: class @Roles reaches a @Public handler.
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

@Controller('owned')
@UseGuards(RolesGuard, OpiekunOwnershipGuard)
class OwnedController {
  @Get(':id')
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  byClassGuard(): void {}

  // Contradiction: no CarrierOwnershipGuard anywhere on this route.
  @Put(':id')
  @Roles('przewoznik')
  @CarrierOwns('id')
  inert(): void {}

  @Delete(':id')
  @Roles('przewoznik', 'opiekun')
  @UseGuards(CarrierOwnershipGuard)
  @CarrierOwns('vehicleId', 'body')
  @OpiekunOwns('vehicleId', 'body', 'vehicleId')
  both(): void {}

  @Post()
  @Roles('admin')
  noOwnership(): void {}
}

const routes = listRoutes([ThingsController, OpenController, OwnedController]);

describe('buildRolesSnapshot', () => {
  const { snapshot, contradictions } = buildRolesSnapshot(routes);

  it('resolves handler over class, empty @Roles() as any session, roles in RoleSchema order', () => {
    expect(snapshot).toEqual({
      'DELETE /owned/:id': ['opiekun', 'przewoznik'],
      'GET /open': ACCESS_PUBLIC,
      'GET /owned/:id': ['admin', 'opiekun'],
      'GET /things': ['admin', 'opiekun'],
      'GET /things/:id': ACCESS_AUTHENTICATED,
      'PATCH /things/:id': ['admin', 'weryfikator'],
      'POST /owned': ['admin'],
      'POST /things': ACCESS_PUBLIC,
      'PUT /owned/:id': ['przewoznik'],
    });
  });

  it('emits keys sorted by code unit', () => {
    const keys = Object.keys(snapshot);
    expect(keys).toEqual([...keys].sort());
  });

  it('flags @Public + @Roles', () => {
    expect(contradictions).toEqual([
      expect.stringContaining('POST /things (ThingsController.publicButGated): @Public together with @Roles(admin, opiekun)'),
    ]);
  });

  it('flags a duplicate METHOD /path and a value that is not a role', () => {
    const [first] = routes;
    if (!first) throw new TypeError('no synthetic routes discovered');
    const bogus = { ...first, key: 'GET /bogus', handler: 'bogus', handlerRef: bogusHandler };
    const result = buildRolesSnapshot([first, first, bogus]);
    expect(result.contradictions).toEqual([
      expect.stringContaining('a second handler resolves to the same METHOD /path'),
      expect.stringContaining('@Roles carries a value that is not a Role: "superuser"'),
    ]);
    expect(result.snapshot['GET /bogus']).toEqual(['admin']);
  });
});

function bogusHandler(): void {}
Reflect.defineMetadata('roles', ['admin', 'superuser'], bogusHandler);

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

// ─── @RequirePermission (docs/25 §3 B2.0) ──────────────────

@Controller('perm')
class PermController {
  @Get()
  @RequirePermission('users.manage')
  adminOnly(): void {}

  // The leader rule: a planista counts because `permissionsFor('planista', true)`
  // holds the requirement — exactly how the B1 fixture records the decide routes.
  @Post(':id/approve')
  @RequirePermission('vehicles.planner_transfer.decide')
  decide(): void {}

  // Any-of, listed out of catalog order and with a duplicate.
  @Patch(':id')
  @RequirePermission('users.manage', 'claims.verify', 'users.manage')
  anyOf(): void {}

  // Ownership guard on a permission route: recorded exactly as on a @Roles one.
  @Put(':id')
  @RequirePermission('carriers.write')
  @UseGuards(OpiekunOwnershipGuard)
  @OpiekunOwns('id', 'param', 'carrierId')
  owned(): void {}
}

@Controller('perm-class')
@RequirePermission('users.manage')
class PermClassController {
  @Get()
  inherits(): void {}

  @Get(':id')
  @RequirePermission('vehicles.planner_transfer.decide')
  handlerWins(): void {}
}

@Controller('perm-bad')
class PermContradictionsController {
  // Contradiction: both decorators on one route.
  @Delete(':id')
  @Roles('admin', 'pracownik')
  @RequirePermission('claims.verify')
  both(): void {}

  // Contradiction: PermissionsGuard lets @Public through, the requirement is dead.
  @Post()
  @Public()
  @RequirePermission('users.manage')
  publicWithRequirement(): void {}

  // Contradictions only raw metadata can produce (the typed decorator forbids them).
  @Get('empty')
  @SetMetadata(PERMISSIONS_METADATA_KEY, [])
  empty(): void {}

  @Get('unknown')
  @SetMetadata(PERMISSIONS_METADATA_KEY, ['users.manage', 'root.everything'])
  unknownPermission(): void {}
}

@Controller('perm-class-roles')
@Roles('admin')
class ClassRolesHandlerPermController {
  // Contradiction across levels: class @Roles reaches a handler @RequirePermission.
  @Get()
  @RequirePermission('claims.read')
  mixed(): void {}

  @Get('plain')
  plain(): void {}
}

const permRoutes = listRoutes([PermController, PermClassController]);
const badRoutes = listRoutes([PermContradictionsController, ClassRolesHandlerPermController]);

describe('buildRolesSnapshot — @RequirePermission', () => {
  it('records a permission-only route as rolesSatisfying(required, { lider: true })', () => {
    const { snapshot, contradictions } = buildRolesSnapshot(permRoutes);
    expect(contradictions).toEqual([]);
    expect(snapshot).toEqual({
      'GET /perm': ['admin'],
      'GET /perm-class': ['admin'],
      'GET /perm-class/:id': ['admin', 'planista'],
      'PATCH /perm/:id': ['admin', 'pracownik'],
      'POST /perm/:id/approve': ['admin', 'planista'],
      'PUT /perm/:id': ['admin', 'opiekun'],
    });
    // Same derivation as the B1 equivalence spec, not a hand-kept list.
    expect(snapshot['POST /perm/:id/approve']).toEqual(
      rolesSatisfying(['vehicles.planner_transfer.decide'], { lider: true }),
    );
    expect(rolesSatisfying(['vehicles.planner_transfer.decide'])).toEqual(['admin']);
  });

  it('flags @Roles + @RequirePermission (same level and across levels) and records the intersection', () => {
    const { snapshot, contradictions } = buildRolesSnapshot(badRoutes);
    expect(contradictions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'DELETE /perm-bad/:id (PermContradictionsController.both): @Roles(admin, pracownik) together with @RequirePermission(claims.verify)',
        ),
        expect.stringContaining(
          'GET /perm-class-roles (ClassRolesHandlerPermController.mixed): @Roles(admin) together with @RequirePermission(claims.read)',
        ),
      ]),
    );
    // Both guards run: roles ∩ rolesSatisfying.
    expect(snapshot['DELETE /perm-bad/:id']).toEqual(['admin', 'pracownik']);
    expect(snapshot['GET /perm-class-roles']).toEqual(['admin']);
    // A plain handler under the class @Roles is not a contradiction.
    expect(snapshot['GET /perm-class-roles/plain']).toEqual(['admin']);
  });

  it('flags @Public + @RequirePermission and records the route as PUBLIC (what the guards do)', () => {
    const { snapshot, contradictions } = buildRolesSnapshot(badRoutes);
    expect(contradictions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'POST /perm-bad (PermContradictionsController.publicWithRequirement): @Public together with @RequirePermission(users.manage)',
        ),
      ]),
    );
    expect(snapshot['POST /perm-bad']).toBe(ACCESS_PUBLIC);
  });

  it('flags an empty and a non-catalog requirement; an empty one is never recorded as AUTHENTICATED', () => {
    const { snapshot, contradictions } = buildRolesSnapshot(badRoutes);
    expect(contradictions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('GET /perm-bad/empty (PermContradictionsController.empty): @RequirePermission without a catalog permission'),
        expect.stringContaining(
          'GET /perm-bad/unknown (PermContradictionsController.unknownPermission): @RequirePermission carries a value that is not a Permission: "root.everything"',
        ),
      ]),
    );
    expect(snapshot['GET /perm-bad/empty']).toEqual([]);
    expect(snapshot['GET /perm-bad/unknown']).toEqual(['admin']);
    // `[]` cannot be committed: the fixture parser rejects it.
    expect(() => parseRolesSnapshot({ 'GET /perm-bad/empty': [] })).toThrow(TypeError);
  });

  it('reports exactly those five contradictions, nothing else', () => {
    expect(buildRolesSnapshot(badRoutes).contradictions).toHaveLength(5);
  });
});

describe('buildOwnershipSnapshot — @RequirePermission routes', () => {
  it('records the ownership guard of a permission route and nothing about the permission', () => {
    const { snapshot, contradictions } = buildOwnershipSnapshot(permRoutes);
    expect(contradictions).toEqual([]);
    expect(snapshot).toEqual({
      'PUT /perm/:id': { opiekun: { source: 'param', name: 'id', as: 'carrierId' } },
    });
  });
});

describe('buildPermissionRequirements', () => {
  it('lists every route with live @RequirePermission — catalog order, deduplicated, handler over class', () => {
    expect(buildPermissionRequirements([...permRoutes, ...routes])).toEqual({
      'GET /perm': ['users.manage'],
      'GET /perm-class': ['users.manage'],
      'GET /perm-class/:id': ['vehicles.planner_transfer.decide'],
      'PATCH /perm/:id': ['claims.verify', 'users.manage'],
      'POST /perm/:id/approve': ['vehicles.planner_transfer.decide'],
      'PUT /perm/:id': ['carriers.write'],
    });
  });

  it('keeps malformed requirements visible (empty / catalog part only)', () => {
    const live = buildPermissionRequirements(badRoutes);
    expect(live['GET /perm-bad/empty']).toEqual([]);
    expect(live['GET /perm-bad/unknown']).toEqual(['users.manage']);
    expect('GET /perm-class-roles/plain' in live).toBe(false);
  });
});

describe('routeGate', () => {
  const gateOf = (key: string): string => {
    const route = [...routes, ...permRoutes, ...badRoutes].find((r) => r.key === key);
    if (!route) throw new TypeError(`no synthetic route ${key}`);
    return routeGate(route);
  };

  it('classifies every kind of authorization decision', () => {
    expect(gateOf('GET /open')).toBe('public');
    expect(gateOf('POST /perm-bad')).toBe('public');
    expect(gateOf('GET /things')).toBe('roles');
    expect(gateOf('GET /perm')).toBe('permissions');
    expect(gateOf('GET /perm-class')).toBe('permissions');
    expect(gateOf('DELETE /perm-bad/:id')).toBe('both');
    expect(gateOf('GET /perm-class-roles')).toBe('both');
    // Empty @Roles() = any session: not a decision the inverse rule accepts.
    expect(gateOf('GET /things/:id')).toBe('none');
  });
});
