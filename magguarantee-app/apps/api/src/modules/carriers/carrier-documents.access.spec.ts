// Who reaches the five carrier-document routes (docs/25 §3 B6 — the first real
// case; docs/13 «Carriers»), over HTTP:
//
//   POST   /carriers/:id/attachments                      carrier_documents.add
//   GET    /carriers/:id/attachments                      carrier_documents.read
//   GET    /carriers/:id/attachments/:attachmentId/download  carrier_documents.read
//   DELETE /carriers/:id/attachments/:attachmentId        carrier_documents.delete
//   GET    /carriers/:id/documents/overview               carrier_documents.read
//
// The chain is the production one from the user row on: the REAL
// `JwtAccessStrategy.validate` builds `req.user` (so the B6 overrides go
// through `effectivePermissions`), then the REAL `PermissionsGuard` (APP_GUARD)
// and the REAL `OpiekunOwnershipGuard` / `CarrierOwnershipGuard` of the
// controllers. Only the services and Prisma are fakes — neither service has a
// role branch, the guards ARE the scope.
//
// Acceptance (docs/25 §3 B6 box): a carrier holding the grant lists, downloads,
// uploads and sees the overview of HIS carrier (200/201), gets 403 on anyone
// else's, and cannot delete (403 — `.delete` is not grantable); a carrier
// without the grant gets 403 everywhere; admin and opiekun are unchanged.

import 'reflect-metadata';

import { Readable } from 'node:stream';

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ProblemDetailsFilter } from '../../common/errors/problem-details.filter';
import type { Env } from '../../config/env.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtAccessStrategy } from '../auth/strategies/jwt-access.strategy';
import { PrismaService } from '../prisma/prisma.service';
import type { UserRow } from '../users/users.repository';
import type { UsersService } from '../users/users.service';
import { CarrierAttachmentsController } from './carrier-attachments.controller';
import { CarrierAttachmentsService } from './carrier-attachments.service';
import { CarrierDocumentsService } from './carrier-documents.service';
import { CarriersController } from './carriers.controller';
import { CarriersService } from './carriers.service';

const NOW = new Date('2026-10-27T09:00:00.000Z');
const CARRIER_X = '1b0c6a52-8c33-4f0e-9d7e-2b1a6f3c4d01';
const CARRIER_Y = '2c1d7b63-9d44-4a1f-8e8f-3c2b7a4d5e02';
const ATTACHMENT = '3d2e8c74-ae55-4b20-9f90-4d3c8b5e6f03';

function userRow(id: string, over: Partial<UserRow>): UserRow {
  return {
    id,
    login: id,
    email: `${id}@example.com`,
    passwordHash: 'hash',
    role: 'przewoznik',
    name: id,
    active: true,
    liderId: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    authProvider: 'local',
    managedBy: 'local',
    googleSub: null,
    magspaceEmployeeId: null,
    directorySyncedAt: null,
    roleOverride: null,
    lider: false,
    extraPermissions: [],
    deniedPermissions: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
}

/** The users the `x-test-user` header picks, as stored rows. */
const USERS: Record<string, UserRow> = {
  // przewoznik2 of the seed: owns CARRIER_X, holds the B6 grant.
  'carrier-granted': userRow('carrier-granted', {
    extraPermissions: ['carrier_documents.read', 'carrier_documents.add'],
  }),
  // A carrier who also had `.delete` stored by hand — inert, not grantable.
  'carrier-granted-delete': userRow('carrier-granted-delete', {
    extraPermissions: ['carrier_documents.read', 'carrier_documents.add', 'carrier_documents.delete'],
  }),
  // Owns CARRIER_X too, but no grant: behaves exactly like before B6.
  'carrier-plain': userRow('carrier-plain', {}),
  admin: userRow('admin', { role: 'admin' }),
  'opiekun-own': userRow('opiekun-own', { role: 'opiekun' }),
  'opiekun-other': userRow('opiekun-other', { role: 'opiekun' }),
  // An opiekun with `.delete` revoked (B6 denial).
  'opiekun-no-delete': userRow('opiekun-no-delete', {
    role: 'opiekun',
    deniedPermissions: ['carrier_documents.delete'],
  }),
};

/** Carrier rows: X belongs to the carrier users and to opiekun-own; Y to someone else. */
const CARRIERS = [
  { id: CARRIER_X, userIds: ['carrier-granted', 'carrier-granted-delete', 'carrier-plain'], opiekunIds: ['opiekun-own', 'opiekun-no-delete'] },
  { id: CARRIER_Y, userIds: ['someone-else'], opiekunIds: ['opiekun-other'] },
];

const fakePrisma = {
  client: {
    carrier: {
      findFirst: jest.fn(async (args: { where: { id?: string; userId?: string } }) => {
        const { id, userId } = args.where;
        if (userId !== undefined) {
          const own = CARRIERS.find((c) => c.userIds.includes(userId));
          return own ? { id: own.id } : null;
        }
        const row = CARRIERS.find((c) => c.id === id);
        if (!row) return null;
        // OpiekunOwnershipGuard compares `opiekunId` with the caller. A real row
        // has ONE opiekun; this fake lets two test opiekuni look after X.
        const opiekunId = row.opiekunIds.includes(currentUserId) ? currentUserId : row.opiekunIds[0];
        return { id: row.id, opiekunId };
      }),
    },
  },
};

/** Who is calling — read by the fake carrier row above (opiekun ownership). */
let currentUserId = '';

/**
 * Stand-in for the global JwtAuthGuard: `x-test-user` names a row, and the
 * REAL `JwtAccessStrategy.validate` turns it into `req.user`.
 */
@Injectable()
class HeaderJwtGuard implements CanActivate {
  private readonly strategy = new JwtAccessStrategy(
    { get: () => 'a'.repeat(32) } as unknown as ConfigService<Env, true>,
    { findById: async (id: string) => USERS[id] ?? null } as unknown as UsersService,
  );

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const id = req.headers['x-test-user'];
    const row = id ? USERS[id] : undefined;
    if (!row) throw new UnauthorizedException();
    const user = await this.strategy.validate({ sub: row.id, role: row.role });
    currentUserId = row.id;
    req.user = user;
    return true;
  }
}

const attachments = {
  list: jest.fn(async (carrierId: string) => [{ id: ATTACHMENT, carrierId }]),
  upload: jest.fn(async (_user: unknown, carrierId: string, category: string) => ({
    id: ATTACHMENT,
    carrierId,
    category,
  })),
  download: jest.fn(async () => ({
    object: { body: Readable.from([Buffer.from('%PDF')]), contentType: 'application/pdf', contentLength: 4 },
    fileName: 'oc.pdf',
    mimeType: 'application/pdf',
    category: 'insurance',
  })),
  delete: jest.fn(async () => undefined),
};
const documents = { overview: jest.fn(async (carrierId: string) => ({ carrierId })) };

async function boot(): Promise<INestApplication> {
  Logger.overrideLogger(false);
  const moduleRef = await Test.createTestingModule({
    controllers: [CarrierAttachmentsController, CarriersController],
    providers: [
      { provide: CarrierAttachmentsService, useValue: attachments },
      { provide: CarrierDocumentsService, useValue: documents },
      { provide: CarriersService, useValue: {} },
      { provide: PrismaService, useValue: fakePrisma },
      { provide: APP_GUARD, useClass: HeaderJwtGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();
  return app;
}

type Call = (app: INestApplication, user: string, carrierId: string) => request.Test;

const ROUTES: Record<'list' | 'download' | 'upload' | 'overview' | 'delete', Call> = {
  list: (app, user, id) =>
    request(app.getHttpServer()).get(`/api/v1/carriers/${id}/attachments`).set('x-test-user', user),
  download: (app, user, id) =>
    request(app.getHttpServer())
      .get(`/api/v1/carriers/${id}/attachments/${ATTACHMENT}/download`)
      .set('x-test-user', user),
  upload: (app, user, id) =>
    request(app.getHttpServer())
      .post(`/api/v1/carriers/${id}/attachments`)
      .set('x-test-user', user)
      .field('category', 'insurance')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'oc.pdf', contentType: 'application/pdf' }),
  overview: (app, user, id) =>
    request(app.getHttpServer()).get(`/api/v1/carriers/${id}/documents/overview`).set('x-test-user', user),
  delete: (app, user, id) =>
    request(app.getHttpServer())
      .delete(`/api/v1/carriers/${id}/attachments/${ATTACHMENT}`)
      .set('x-test-user', user),
};

const OK: Record<keyof typeof ROUTES, number> = {
  list: 200,
  download: 200,
  upload: 201,
  overview: 200,
  delete: 204,
};

const READ_ADD: Array<keyof typeof ROUTES> = ['list', 'download', 'upload', 'overview'];
const ALL: Array<keyof typeof ROUTES> = [...READ_ADD, 'delete'];

describe('carrier documents — access over HTTP (docs/25 B6)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await boot();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('przewoznik WITH the grant (carrier_documents.read/.add)', () => {
    it.each(READ_ADD)('%s on his own carrier → success', async (route) => {
      await ROUTES[route](app, 'carrier-granted', CARRIER_X).expect(OK[route]);
    });

    it('upload reaches the service with his carrier id and the category', async () => {
      const res = await ROUTES.upload(app, 'carrier-granted', CARRIER_X).expect(201);

      expect(res.body).toEqual({ id: ATTACHMENT, carrierId: CARRIER_X, category: 'insurance' });
      expect(attachments.upload).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'carrier-granted', role: 'przewoznik' }),
        CARRIER_X,
        'insurance',
        expect.objectContaining({ originalname: 'oc.pdf' }),
      );
    });

    it('download streams the file', async () => {
      const res = await ROUTES.download(app, 'carrier-granted', CARRIER_X).expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(attachments.download).toHaveBeenCalledWith(CARRIER_X, ATTACHMENT);
    });

    it.each(READ_ADD)('%s on another carrier → 403, the service is never reached', async (route) => {
      await ROUTES[route](app, 'carrier-granted', CARRIER_Y).expect(403);

      expect(attachments.list).not.toHaveBeenCalled();
      expect(attachments.download).not.toHaveBeenCalled();
      expect(attachments.upload).not.toHaveBeenCalled();
      expect(documents.overview).not.toHaveBeenCalled();
    });

    it('DELETE on his own carrier → 403 (no carrier_documents.delete)', async () => {
      await ROUTES.delete(app, 'carrier-granted', CARRIER_X).expect(403);

      expect(attachments.delete).not.toHaveBeenCalled();
    });

    it('a stored carrier_documents.delete is inert — not grantable, still 403', async () => {
      await ROUTES.delete(app, 'carrier-granted-delete', CARRIER_X).expect(403);
      await ROUTES.list(app, 'carrier-granted-delete', CARRIER_X).expect(200);

      expect(attachments.delete).not.toHaveBeenCalled();
    });
  });

  describe('przewoznik WITHOUT the grant — as before B6', () => {
    it.each(ALL)('%s on his own carrier → 403', async (route) => {
      await ROUTES[route](app, 'carrier-plain', CARRIER_X).expect(403);
    });

    it.each(ALL)('%s on another carrier → 403', async (route) => {
      await ROUTES[route](app, 'carrier-plain', CARRIER_Y).expect(403);
    });
  });

  describe('admin and opiekun — unchanged', () => {
    it.each(ALL)('admin: %s on any carrier → success', async (route) => {
      await ROUTES[route](app, 'admin', CARRIER_X).expect(OK[route]);
      await ROUTES[route](app, 'admin', CARRIER_Y).expect(OK[route]);
    });

    it.each(ALL)('opiekun: %s on his own carrier → success', async (route) => {
      await ROUTES[route](app, 'opiekun-own', CARRIER_X).expect(OK[route]);
    });

    it.each(ALL)('opiekun: %s on a carrier he does not look after → 403', async (route) => {
      await ROUTES[route](app, 'opiekun-other', CARRIER_X).expect(403);
    });

    it('an opiekun with carrier_documents.delete revoked (B6 denial) reads and uploads but cannot delete', async () => {
      await ROUTES.list(app, 'opiekun-no-delete', CARRIER_X).expect(200);
      await ROUTES.upload(app, 'opiekun-no-delete', CARRIER_X).expect(201);
      await ROUTES.delete(app, 'opiekun-no-delete', CARRIER_X).expect(403);
    });
  });

  it('401 without a session', async () => {
    await request(app.getHttpServer()).get(`/api/v1/carriers/${CARRIER_X}/attachments`).expect(401);
  });
});
