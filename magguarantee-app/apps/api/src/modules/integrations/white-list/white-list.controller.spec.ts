// HTTP-level contract for the Biała Lista lookups after the 2026-09-14 move
// from query strings to POST bodies (logging audit, item 2): exact paths, 200
// (not 201), body validation, role gate, no @Audit, throttle kept.

import 'reflect-metadata';

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import type { WhiteListResponse, WhiteListSearchResponse } from '@magguarantee/shared';

import { AUDIT_METADATA_KEY } from '../../../common/audit/audit.constants';
import { ProblemDetailsFilter } from '../../../common/errors/problem-details.filter';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { WhiteListController } from './white-list.controller';
import { WhiteListService } from './white-list.service';

const NIP = '1234567890';
const ACCOUNT = '12345678901234567890123456';

/** Stand-in for the global JwtAuthGuard: `x-test-role` header ⇒ authenticated. */
@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    const role = req.headers['x-test-role'];
    if (!role) throw new UnauthorizedException();
    req.user = { sub: 'u-1', login: 'u', email: 'u@magtrans.eu', name: 'U', role, mustChangePassword: false };
    return true;
  }
}

const CHECK_RESULT: WhiteListResponse = {
  nip: NIP,
  account: ACCOUNT,
  accountAssigned: true,
  accountAssignedRaw: 'TAK',
  requestId: 'req-1',
  requestDateTime: '2026-09-14T10:00:00',
  cachedAt: null,
};

const SEARCH_RESULT: WhiteListSearchResponse = {
  found: true,
  nip: NIP,
  name: 'ACME',
  address: 'Warszawa',
  accountNumbers: [ACCOUNT],
  statusVat: 'Czynny',
  requestId: 'req-2',
  requestDateTime: '2026-09-14T10:00:00',
  cachedAt: null,
};

describe('WhiteListController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    checkAccount: jest.fn(async () => CHECK_RESULT),
    searchByNip: jest.fn(async () => SEARCH_RESULT),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WhiteListController],
      providers: [
        { provide: WhiteListService, useValue: service },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.checkAccount.mockClear();
    service.searchByNip.mockClear();
  });

  describe('POST /api/v1/integrations/whitelist/check', () => {
    const path = '/api/v1/integrations/whitelist/check';

    it.each(['admin', 'opiekun'])('200 for %s, body forwarded to the service', async (role) => {
      const res = await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', role)
        .send({ nip: NIP, account: ACCOUNT })
        .expect(200);

      expect(res.body).toEqual(CHECK_RESULT);
      expect(service.checkAccount).toHaveBeenCalledWith(NIP, ACCOUNT);
    });

    it('401 without authentication', async () => {
      await request(app.getHttpServer()).post(path).send({ nip: NIP, account: ACCOUNT }).expect(401);
      expect(service.checkAccount).not.toHaveBeenCalled();
    });

    it.each(['pracownik', 'przewoznik', 'planista', 'dyspozytor'])('403 for %s', async (role) => {
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', role)
        .send({ nip: NIP, account: ACCOUNT })
        .expect(403);
      expect(service.checkAccount).not.toHaveBeenCalled();
    });

    it('the 403 WARN line names the route template and carries no NIP / account', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        await request(app.getHttpServer())
          .post(path)
          .set('x-test-role', 'przewoznik')
          .send({ nip: NIP, account: ACCOUNT })
          .expect(403);

        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({
            msg: 'request forbidden',
            status: 403,
            method: 'POST',
            route: '/api/v1/integrations/whitelist/check',
            userId: 'u-1',
          }),
        );
        const logged = JSON.stringify(warn.mock.calls);
        expect(logged).not.toContain(NIP);
        expect(logged).not.toContain(ACCOUNT);
      } finally {
        warn.mockRestore();
      }
    });

    it.each([
      [{ nip: NIP }],
      [{ nip: '123', account: ACCOUNT }],
      [{ nip: NIP, account: ACCOUNT, extra: 1 }],
    ])('400 on an invalid body %j', async (body) => {
      const res = await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', 'admin')
        .send(body)
        .expect(400);
      expect(res.body.type).toBe('/problems/validation');
      expect(service.checkAccount).not.toHaveBeenCalled();
    });

    it('the old GET-with-query route is gone', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/integrations/whitelist?nip=${NIP}&account=${ACCOUNT}`)
        .set('x-test-role', 'admin')
        .expect(404);
    });
  });

  describe('POST /api/v1/integrations/whitelist/search', () => {
    const path = '/api/v1/integrations/whitelist/search';

    it('200 with the search DTO', async () => {
      const res = await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', 'opiekun')
        .send({ nip: NIP })
        .expect(200);

      expect(res.body).toEqual(SEARCH_RESULT);
      expect(service.searchByNip).toHaveBeenCalledWith(NIP);
    });

    it('403 for przewoznik', async () => {
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', 'przewoznik')
        .send({ nip: NIP })
        .expect(403);
    });

    it('400 when nip is missing', async () => {
      await request(app.getHttpServer())
        .post(path)
        .set('x-test-role', 'admin')
        .send({})
        .expect(400);
    });

    it('the old GET-with-query route is gone', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/integrations/whitelist/search?nip=${NIP}`)
        .set('x-test-role', 'admin')
        .expect(404);
    });
  });

  describe('metadata', () => {
    const reflector = new Reflector();

    it.each(['check', 'search'] as const)('%s is not audited (read-only lookup) and is throttled', (name) => {
      const handler = WhiteListController.prototype[name];
      expect(reflector.get(AUDIT_METADATA_KEY, handler)).toBeUndefined();
      expect(reflector.get(AUDIT_METADATA_KEY, WhiteListController)).toBeUndefined();
      expect(reflector.get('THROTTLER:LIMITdefault', handler)).toEqual(expect.any(Number));
      expect(reflector.get('THROTTLER:TTLdefault', handler)).toBe(60_000);
    });
  });
});
