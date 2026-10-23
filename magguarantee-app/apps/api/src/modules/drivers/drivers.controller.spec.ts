import 'reflect-metadata';

import {
  ExecutionContext,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { rolesSatisfying, type Permission, type Role } from '@magguarantee/shared';

import { makeAuthUser, withRole } from '../../common/testing/make-auth-user';
import { PERMISSIONS_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DriversController } from './drivers.controller';
import type { DriversService } from './drivers.service';

/**
 * Authorization unit tests for `DriversController`.
 *
 * Carriers (`przewoznik`) are view-only for drivers — they may LIST and
 * READ their drivers but never create/update/(de|re)activate/delete. Only
 * `admin`/`opiekun` reach the mutating handlers. Mirrors the already-correct
 * trailers controller (docs/03-roles.md access matrix).
 *
 * Track B (docs/25 §3 B2): the routes carry `@RequirePermission` instead of
 * `@Roles` — `drivers.read` on the reads, `fleet.write` on the mutations.
 * Two layers are asserted (same pattern as `claims.controller.roles.spec.ts`):
 *  1. The `@RequirePermission(...)` metadata declared on each handler is
 *     exactly the requirement recorded in the generated fixture
 *     (`common/authz/__fixtures__/endpoint-permissions.snapshot.json`),
 *     and the catalog maps it onto the documented role set (reflection —
 *     catches an accidental decorator or catalog change).
 *  2. `PermissionsGuard` actually rejects a `przewoznik` user (built like
 *     `JwtAccessStrategy` builds it, `makeAuthUser`) on mutations (403) and
 *     passes a `przewoznik` through on the GET routes.
 */

const reflector = new Reflector();

function handlerOf(name: keyof DriversController): (...args: never[]) => unknown {
  return DriversController.prototype[name] as (...args: never[]) => unknown;
}

/** The live requirement, resolved like `PermissionsGuard` does (handler, then class). */
function requiredFor(handlerName: keyof DriversController): Permission[] {
  const meta = reflector.getAllAndOverride<Permission[] | undefined>(
    PERMISSIONS_METADATA_KEY,
    [handlerOf(handlerName), DriversController],
  );
  return meta ?? [];
}

/** Who the catalog admits through that requirement (leader rule as in the snapshot). */
function admittedRoles(handlerName: keyof DriversController): Role[] {
  return rolesSatisfying(requiredFor(handlerName), { lider: true });
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
  const guard = new PermissionsGuard(reflector);

  describe('@RequirePermission metadata', () => {
    it.each(MUTATING)('%s requires exactly fleet.write', (handler) => {
      expect(requiredFor(handler)).toEqual(['fleet.write']);
    });

    it.each(MUTATING)(
      '%s admits only admin + opiekun (no przewoznik)',
      (handler) => {
        const roles = admittedRoles(handler);
        expect([...roles].sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
      },
    );

    it.each(READ_ONLY)('%s requires exactly drivers.read', (handler) => {
      expect(requiredFor(handler)).toEqual(['drivers.read']);
    });

    it.each(READ_ONLY)('%s still admits przewoznik to view', (handler) => {
      const roles = admittedRoles(handler);
      expect(roles).toContain('przewoznik');
      expect(roles).toContain('admin');
      expect(roles).toContain('opiekun');
    });

    it.each(ATTACHMENT_MUTATING)('%s requires exactly fleet.write', (handler) => {
      expect(requiredFor(handler)).toEqual(['fleet.write']);
    });

    it.each(ATTACHMENT_MUTATING)(
      '%s admits only admin + opiekun (no przewoznik)',
      (handler) => {
        const roles = admittedRoles(handler);
        expect([...roles].sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
      },
    );
  });

  describe('PermissionsGuard against a przewoznik user', () => {
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
