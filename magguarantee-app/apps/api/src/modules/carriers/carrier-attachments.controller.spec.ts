import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CarrierAttachmentsController } from './carrier-attachments.controller';

/**
 * Authorization unit tests for `CarrierAttachmentsController`.
 *
 * Mirrors the carrier CRUD access matrix (docs/03-roles.md): admin /
 * opiekun(own) only. `przewoznik` and `pracownik` never reach these
 * standalone document endpoints. Opiekun ownership is enforced upstream by
 * `OpiekunOwnershipGuard` (`@OpiekunOwns('id','param','carrierId')`) since
 * the carrier id is a route param on every endpoint — including the
 * multipart upload.
 */

const reflector = new Reflector();

function handlerOf(
  name: keyof CarrierAttachmentsController,
): (...args: never[]) => unknown {
  return CarrierAttachmentsController.prototype[name] as (
    ...args: never[]
  ) => unknown;
}

function rolesFor(handlerName: keyof CarrierAttachmentsController): Role[] {
  const meta = reflector.get<Role[] | undefined>(
    ROLES_METADATA_KEY,
    handlerOf(handlerName),
  );
  return meta ?? [];
}

function ctxFor(
  handlerName: keyof CarrierAttachmentsController,
  user: AuthUser | undefined,
): ExecutionContext {
  const handler = handlerOf(handlerName);
  return {
    getHandler: () => handler,
    getClass: () => CarrierAttachmentsController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const ALL_HANDLERS: (keyof CarrierAttachmentsController)[] = [
  'upload',
  'list',
  'download',
  'delete',
];

const carrierUser: AuthUser = {
  sub: 'u-carrier',
  login: 'przewoznik1',
  email: 'przewoznik1@magtrans.eu',
  name: 'Carrier One',
  role: 'przewoznik',
  mustChangePassword: false,
};

describe('CarrierAttachmentsController — authorization', () => {
  const guard = new RolesGuard(reflector);

  describe('@Roles metadata', () => {
    it.each(ALL_HANDLERS)(
      '%s is restricted to admin + opiekun',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles.sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
        expect(roles).not.toContain('pracownik');
      },
    );
  });

  describe('RolesGuard', () => {
    it.each(ALL_HANDLERS)('rejects przewoznik on %s with 403', (handler) => {
      expect(() => guard.canActivate(ctxFor(handler, carrierUser))).toThrow(
        ForbiddenException,
      );
    });

    it.each(ALL_HANDLERS)('allows admin on %s', (handler) => {
      const adminUser: AuthUser = { ...carrierUser, role: 'admin' };
      expect(guard.canActivate(ctxFor(handler, adminUser))).toBe(true);
    });

    it.each(ALL_HANDLERS)('allows opiekun on %s', (handler) => {
      const opiekunUser: AuthUser = { ...carrierUser, role: 'opiekun' };
      expect(guard.canActivate(ctxFor(handler, opiekunUser))).toBe(true);
    });
  });
});
