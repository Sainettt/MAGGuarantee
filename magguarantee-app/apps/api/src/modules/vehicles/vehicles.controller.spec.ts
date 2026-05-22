import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VehiclesController } from './vehicles.controller';

/**
 * Authorization unit tests for `VehiclesController`.
 *
 * Carriers (`przewoznik`) are view-only for vehicles — they may LIST and
 * READ vehicles but never update/(de|re)activate them; create/delete already
 * excluded carriers. Only `admin`/`opiekun` reach the mutating handlers.
 * Mirrors the already-correct trailers controller (docs/03-roles.md).
 *
 * Two layers are asserted:
 *  1. The `@Roles(...)` metadata on the changed handlers is exactly the
 *     documented set.
 *  2. `RolesGuard` rejects a `przewoznik` token on those mutations (403) and
 *     passes a `przewoznik` through on the GET routes.
 */

const reflector = new Reflector();

function handlerOf(
  name: keyof VehiclesController,
): (...args: never[]) => unknown {
  return VehiclesController.prototype[name] as (...args: never[]) => unknown;
}

function rolesFor(handlerName: keyof VehiclesController): Role[] {
  const meta = reflector.get<Role[] | undefined>(
    ROLES_METADATA_KEY,
    handlerOf(handlerName),
  );
  return meta ?? [];
}

/** Minimal `ExecutionContext` carrying the given user on `req.user`. */
function ctxFor(
  handlerName: keyof VehiclesController,
  user: AuthUser | undefined,
): ExecutionContext {
  const handler = handlerOf(handlerName);
  return {
    getHandler: () => handler,
    getClass: () => VehiclesController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const carrierUser: AuthUser = {
  sub: 'u-carrier',
  login: 'przewoznik1',
  email: 'przewoznik1@magtrans.eu',
  name: 'Carrier One',
  role: 'przewoznik',
};

/** Mutating routes the carrier-lockdown wave removed `przewoznik` from. */
const LOCKED_MUTATIONS: (keyof VehiclesController)[] = [
  'update',
  'deactivate',
  'reactivate',
];

/** Read routes the carrier MUST keep access to. */
const READ_ONLY: (keyof VehiclesController)[] = ['list', 'getById'];

describe('VehiclesController — authorization', () => {
  const guard = new RolesGuard(reflector);

  describe('@Roles metadata', () => {
    it.each(LOCKED_MUTATIONS)(
      '%s is restricted to admin + opiekun (no przewoznik)',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles.sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
      },
    );

    it.each(READ_ONLY)('%s still allows przewoznik to view', (handler) => {
      expect(rolesFor(handler)).toContain('przewoznik');
    });

    it('create still excludes przewoznik (unchanged)', () => {
      expect(rolesFor('create')).not.toContain('przewoznik');
    });

    it('delete still excludes przewoznik (unchanged)', () => {
      expect(rolesFor('delete')).not.toContain('przewoznik');
    });
  });

  describe('RolesGuard against a przewoznik token', () => {
    it.each(LOCKED_MUTATIONS)('rejects przewoznik on %s with 403', (handler) => {
      expect(() => guard.canActivate(ctxFor(handler, carrierUser))).toThrow(
        ForbiddenException,
      );
    });

    it.each(READ_ONLY)('allows przewoznik on %s', (handler) => {
      expect(guard.canActivate(ctxFor(handler, carrierUser))).toBe(true);
    });

    it.each(LOCKED_MUTATIONS)('still allows admin on %s', (handler) => {
      const adminUser: AuthUser = { ...carrierUser, role: 'admin' };
      expect(guard.canActivate(ctxFor(handler, adminUser))).toBe(true);
    });

    it.each(LOCKED_MUTATIONS)('still allows opiekun on %s', (handler) => {
      const opiekunUser: AuthUser = { ...carrierUser, role: 'opiekun' };
      expect(guard.canActivate(ctxFor(handler, opiekunUser))).toBe(true);
    });
  });
});
