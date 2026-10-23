// Unit tests for the pure snapshot builders (`roles-snapshot.ts`).
//
// The live AppModule has no contradictory metadata, so `roles-snapshot.spec.ts`
// alone would never exercise the contradiction branches. Synthetic controllers
// here pin the resolution rules (handler wins over class, empty `@Roles()` =
// any session, role order, guard + decorator pairing) and the fixture helpers.

import { Controller, Delete, Get, Patch, Post, Put, UseGuards } from '@nestjs/common';

import { Public } from '../../modules/auth/decorators/public.decorator';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { CarrierOwnershipGuard, CarrierOwns, OpiekunOwnershipGuard, OpiekunOwns } from '../guards';
import { listRoutes } from '../testing/route-discovery';
import {
  ACCESS_AUTHENTICATED,
  ACCESS_PUBLIC,
  buildOwnershipSnapshot,
  buildRolesSnapshot,
  diffSnapshots,
  formatSnapshot,
  parseOwnershipSnapshot,
  parseRolesSnapshot,
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
