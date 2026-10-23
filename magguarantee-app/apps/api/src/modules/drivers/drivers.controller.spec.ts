import 'reflect-metadata';

import {
  ExecutionContext,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DriversController } from './drivers.controller';
import type { DriversService } from './drivers.service';
import { makeAuthUser, withRole } from '../../common/testing/make-auth-user';

/**
 * Authorization unit tests for `DriversController`.
 *
 * Carriers (`przewoznik`) are view-only for drivers — they may LIST and
 * READ their drivers but never create/update/(de|re)activate/delete. Only
 * `admin`/`opiekun` reach the mutating handlers. Mirrors the already-correct
 * trailers controller (docs/03-roles.md access matrix).
 *
 * Two layers are asserted:
 *  1. The `@Roles(...)` metadata declared on each handler is exactly the
 *     documented set (reflection — catches an accidental decorator change).
 *  2. `RolesGuard` actually rejects a `przewoznik` token on mutations (403)
 *     and passes a `przewoznik` through on the GET routes.
 */

const reflector = new Reflector();

function handlerOf(name: keyof DriversController): (...args: never[]) => unknown {
  return DriversController.prototype[name] as (...args: never[]) => unknown;
}

function rolesFor(handlerName: keyof DriversController): Role[] {
  const meta = reflector.get<Role[] | undefined>(
    ROLES_METADATA_KEY,
    handlerOf(handlerName),
  );
  return meta ?? [];
}

/** Minimal `ExecutionContext` carrying the given user on `req.user`. */
function ctxFor(
  handlerName: keyof DriversController,
  user: AuthUser | undefined,
): ExecutionContext {
  const handler = handlerOf(handlerName);
  return {
    getHandler: () => handler,
    getClass: () => DriversController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const carrierUser: AuthUser = makeAuthUser('przewoznik', {
  sub: 'u-carrier',
  login: 'przewoznik1',
  email: 'przewoznik1@magtrans.eu',
  name: 'Carrier One',
  mustChangePassword: false,
});

const MUTATING: (keyof DriversController)[] = [
  'create',
  'update',
  'deactivate',
  'reactivate',
  'delete',
];

const READ_ONLY: (keyof DriversController)[] = [
  'list',
  'getById',
  'listAttachments',
  'downloadAttachment',
];

/** Attachment mutation — admin + opiekun only (no przewoznik write). */
const ATTACHMENT_MUTATING: (keyof DriversController)[] = ['deleteAttachment'];

describe('DriversController — authorization', () => {
  const guard = new RolesGuard(reflector);

  describe('@Roles metadata', () => {
    it.each(MUTATING)(
      '%s is restricted to admin + opiekun (no przewoznik)',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles.sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
      },
    );

    it.each(READ_ONLY)('%s still allows przewoznik to view', (handler) => {
      const roles = rolesFor(handler);
      expect(roles).toContain('przewoznik');
      expect(roles).toContain('admin');
      expect(roles).toContain('opiekun');
    });

    it.each(ATTACHMENT_MUTATING)(
      '%s is restricted to admin + opiekun (no przewoznik)',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles.sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
      },
    );
  });

  describe('RolesGuard against a przewoznik token', () => {
    it.each(MUTATING)('rejects przewoznik on %s with 403', (handler) => {
      expect(() => guard.canActivate(ctxFor(handler, carrierUser))).toThrow(
        ForbiddenException,
      );
    });

    it.each(READ_ONLY)('allows przewoznik on %s', (handler) => {
      expect(guard.canActivate(ctxFor(handler, carrierUser))).toBe(true);
    });

    it.each(MUTATING)('still allows admin on %s', (handler) => {
      const adminUser: AuthUser = withRole(carrierUser, 'admin');
      expect(guard.canActivate(ctxFor(handler, adminUser))).toBe(true);
    });

    it.each(MUTATING)('still allows opiekun on %s', (handler) => {
      const opiekunUser: AuthUser = withRole(carrierUser, 'opiekun');
      expect(guard.canActivate(ctxFor(handler, opiekunUser))).toBe(true);
    });
  });
});

// ─── download access log (2026-08-14 logging audit, item 22) ───

describe('DriversController.downloadAttachment — access log', () => {
  afterEach(() => jest.restoreAllMocks());

  function build(download: jest.Mock) {
    const service = { downloadAttachment: download } as unknown as DriversService;
    const res = { setHeader: jest.fn() } as unknown as Response;
    return { controller: new DriversController(service), res };
  }

  it('logs ids + category + requester (no filename) and streams the file', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const pipe = jest.fn();
    const download = jest.fn(async () => ({
      object: { body: { pipe }, contentType: 'image/jpeg', contentLength: 3 },
      // Driver scans are typically named after the person — must not be logged.
      fileName: 'Jan Kowalski ADR.jpg',
      mimeType: 'image/jpeg',
      category: 'adr',
    }));
    const { controller, res } = build(download);
    const opiekun: AuthUser = withRole(carrierUser, 'opiekun', { sub: 'u-op' });

    await controller.downloadAttachment(
      opiekun,
      'drv-1',
      'att-1',
      { ip: '203.0.113.7' } as Request,
      res,
    );

    expect(download).toHaveBeenCalledWith('drv-1', 'att-1');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toEqual({
      msg: 'attachment downloaded',
      entity: 'Driver',
      entityId: 'drv-1',
      attachmentId: 'att-1',
      category: 'adr',
      userId: 'u-op',
      role: 'opiekun',
      ip: '203.0.113.7',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Kowalski');
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('does not log when the download is refused', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const download = jest.fn(async () => {
      throw new NotFoundException('Załącznik nie znaleziony');
    });
    const { controller, res } = build(download);

    await expect(
      controller.downloadAttachment(carrierUser, 'drv-1', 'att-x', {} as Request, res),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(log).not.toHaveBeenCalled();
  });
});
