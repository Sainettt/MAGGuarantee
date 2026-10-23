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
import { CarrierAttachmentsController } from './carrier-attachments.controller';
import type { CarrierAttachmentsService } from './carrier-attachments.service';
import { makeAuthUser, withRole } from '../../common/testing/make-auth-user';

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

const carrierUser: AuthUser = makeAuthUser('przewoznik', {
  sub: 'u-carrier',
  login: 'przewoznik1',
  email: 'przewoznik1@magtrans.eu',
  name: 'Carrier One',
  mustChangePassword: false,
});

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
