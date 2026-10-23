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
import { CarrierAttachmentsController } from './carrier-attachments.controller';
import type { CarrierAttachmentsService } from './carrier-attachments.service';

/**
 * Authorization unit tests for `CarrierAttachmentsController`.
 *
 * Mirrors the carrier CRUD access matrix (docs/03-roles.md): admin /
 * opiekun(own) only. `przewoznik` and `pracownik` never reach these
 * standalone document endpoints. Opiekun ownership is enforced upstream by
 * `OpiekunOwnershipGuard` (`@OpiekunOwns('id','param','carrierId')`) since
 * the carrier id is a route param on every endpoint — including the
 * multipart upload.
 *
 * Track B (docs/25 §3 B2): the routes carry `@RequirePermission` instead of
 * `@Roles` — `carrier_documents.read` (list, download), `.add` (upload),
 * `.delete` (delete). Two layers, same pattern as
 * `claims.controller.roles.spec.ts`:
 *   1. the `@RequirePermission(...)` metadata on each handler is exactly the
 *      planned requirement (`common/authz/endpoint-permissions.ts`), and the
 *      catalog maps it onto the documented role set;
 *   2. `PermissionsGuard` lets through / refuses users built the way
 *      `JwtAccessStrategy` builds them (`makeAuthUser(role)`), over the same
 *      role matrix the former `RolesGuard` checks used.
 */

const reflector = new Reflector();

function handlerOf(
  name: keyof CarrierAttachmentsController,
): (...args: never[]) => unknown {
  return CarrierAttachmentsController.prototype[name] as (
    ...args: never[]
  ) => unknown;
}

/** The live requirement, resolved like `PermissionsGuard` does (handler, then class). */
function requiredFor(handlerName: keyof CarrierAttachmentsController): Permission[] {
  const meta = reflector.getAllAndOverride<Permission[] | undefined>(
    PERMISSIONS_METADATA_KEY,
    [handlerOf(handlerName), CarrierAttachmentsController],
  );
  return meta ?? [];
}

/** Who the catalog admits through that requirement (leader rule as in the snapshot). */
function admittedRoles(handlerName: keyof CarrierAttachmentsController): Role[] {
  return rolesSatisfying(requiredFor(handlerName), { lider: true });
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

/** The plan (`ENDPOINT_PERMISSIONS`) per handler — decision 2026-10-23, docs/25 B6. */
const PLANNED: Record<string, Permission[]> = {
  upload: ['carrier_documents.add'],
  list: ['carrier_documents.read'],
  download: ['carrier_documents.read'],
  delete: ['carrier_documents.delete'],
};

const carrierUser: AuthUser = makeAuthUser('przewoznik', {
  sub: 'u-carrier',
  login: 'przewoznik1',
  email: 'przewoznik1@magtrans.eu',
  name: 'Carrier One',
  mustChangePassword: false,
});

describe('CarrierAttachmentsController — authorization', () => {
  const guard = new PermissionsGuard(reflector);

  describe('@RequirePermission metadata', () => {
    it.each(ALL_HANDLERS)('%s requires exactly its planned permission', (handler) => {
      expect(requiredFor(handler)).toEqual(PLANNED[handler]);
    });

    it.each(ALL_HANDLERS)(
      '%s admits exactly admin + opiekun',
      (handler) => {
        const roles = admittedRoles(handler);
        expect([...roles].sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
        expect(roles).not.toContain('pracownik');
      },
    );
  });

  describe('PermissionsGuard', () => {
    it.each(ALL_HANDLERS)('rejects przewoznik on %s with 403', (handler) => {
      expect(() => guard.canActivate(ctxFor(handler, carrierUser))).toThrow(
        ForbiddenException,
      );
    });

    it.each(ALL_HANDLERS)('allows admin on %s', (handler) => {
      const adminUser: AuthUser = withRole(carrierUser, 'admin');
      expect(guard.canActivate(ctxFor(handler, adminUser))).toBe(true);
    });

    it.each(ALL_HANDLERS)('allows opiekun on %s', (handler) => {
      const opiekunUser: AuthUser = withRole(carrierUser, 'opiekun');
      expect(guard.canActivate(ctxFor(handler, opiekunUser))).toBe(true);
    });
  });
});

// ─── download access log (2026-08-14 logging audit, item 22) ───

describe('CarrierAttachmentsController.download — access log', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs ids + category + requester (no filename) and streams the file', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const pipe = jest.fn();
    const download = jest.fn(async () => ({
      object: { body: { pipe }, contentType: 'application/pdf', contentLength: 3 },
      fileName: 'OC przewoźnika Kowalski.pdf',
      mimeType: 'application/pdf',
      category: 'insurance',
    }));
    const service = { download } as unknown as CarrierAttachmentsService;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const admin: AuthUser = withRole(carrierUser, 'admin', { sub: 'u-adm' });

    await new CarrierAttachmentsController(service).download(
      admin,
      'car-1',
      'att-1',
      { ip: '203.0.113.8' } as Request,
      res,
    );

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toEqual({
      msg: 'attachment downloaded',
      entity: 'Carrier',
      entityId: 'car-1',
      attachmentId: 'att-1',
      category: 'insurance',
      userId: 'u-adm',
      role: 'admin',
      ip: '203.0.113.8',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Kowalski');
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('does not log when the download is refused', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const download = jest.fn(async () => {
      throw new NotFoundException('Załącznik nie znaleziony');
    });
    const service = { download } as unknown as CarrierAttachmentsService;
    const res = { setHeader: jest.fn() } as unknown as Response;

    await expect(
      new CarrierAttachmentsController(service).download(
        carrierUser,
        'car-1',
        'att-x',
        {} as Request,
        res,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(log).not.toHaveBeenCalled();
  });
});
