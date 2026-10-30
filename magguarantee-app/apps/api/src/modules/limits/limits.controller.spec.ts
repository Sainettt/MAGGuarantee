// HTTP-level contract for the km limits endpoints after the 2026-10-29 move
// from calendar months to ISO weeks (docs/13-api-design.md «Limits —
// `/api/v1/limits`»): exact paths, status codes, body / path / query
// validation (W53 of a 52-week year, empty bulk, the old monthly shapes) and
// the admin-only gate. The service is mocked — its behaviour lives in
// `limits.service.spec.ts`; the audit rows in `audit-coverage.spec.ts`.

import 'reflect-metadata';

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { RoleSchema, type WeeklyLimitDto } from '@magguarantee/shared';

import { ProblemDetailsFilter } from '../../common/errors/problem-details.filter';
import { makeAuthUser } from '../../common/testing/make-auth-user';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { LimitsController } from './limits.controller';
import { LimitsService } from './limits.service';

/** Stand-in for the global JwtAuthGuard: `x-test-role` header ⇒ authenticated. */
@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    const role = RoleSchema.safeParse(req.headers['x-test-role']);
    if (!role.success) throw new UnauthorizedException();
    req.user = makeAuthUser(role.data);
    return true;
  }
}

const ROW: WeeklyLimitDto = {
  id: '00000000-0000-0000-0000-000000000001',
  isoYear: 2026,
  isoWeek: 23,
  kmPerDay: 540,
  ratePerKm: 0.5,
  kmPerSaturday: null,
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
};

const NON_ADMIN_ROLES = [
  'pracownik',
  'opiekun',
  'planista',
  'dyspozytor',
  'eksport',
  'weryfikator',
  'przewoznik',
] as const;

describe('LimitsController (HTTP)', () => {
  let app: INestApplication;
  const service = {
    listForIsoYear: jest.fn(async () => [ROW]),
    upsert: jest.fn(async () => ROW),
    bulkUpsert: jest.fn(async () => [ROW]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LimitsController],
      providers: [
        { provide: LimitsService, useValue: service },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
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
    service.listForIsoYear.mockClear();
    service.upsert.mockClear();
    service.bulkUpsert.mockClear();
  });

  const http = () => request(app.getHttpServer());

  // ── GET /limits?year= ──

  describe('GET /limits?year=', () => {
    it('200 for admin, the ISO year forwarded as a number', async () => {
      const res = await http().get('/api/v1/limits?year=2026').set('x-test-role', 'admin').expect(200);
      expect(res.body).toEqual([ROW]);
      expect(service.listForIsoYear).toHaveBeenCalledWith(2026);
    });

    it.each([['/api/v1/limits'], ['/api/v1/limits?year=1999'], ['/api/v1/limits?year=2026&month=5']])(
      '400 on an invalid query (%s)',
      async (url) => {
        const res = await http().get(url).set('x-test-role', 'admin').expect(400);
        expect(res.body.type).toBe('/problems/validation');
        expect(service.listForIsoYear).not.toHaveBeenCalled();
      },
    );
  });

  // ── PUT /limits/:isoWeek ──

  describe('PUT /limits/:isoWeek', () => {
    it('200 for admin, key and partial body forwarded', async () => {
      const res = await http()
        .put('/api/v1/limits/2026-W23')
        .set('x-test-role', 'admin')
        .send({ kmPerDay: '300', kmPerSaturday: 0 })
        .expect(200);
      expect(res.body).toEqual(ROW);
      // Coerced; the omitted `ratePerKm` stays omitted.
      expect(service.upsert).toHaveBeenCalledWith('2026-W23', { kmPerDay: 300, kmPerSaturday: 0 });
    });

    it('200 for W53 of a 53-week ISO year (2026)', async () => {
      await http().put('/api/v1/limits/2026-W53').set('x-test-role', 'admin').send({ kmPerDay: 0 }).expect(200);
      expect(service.upsert).toHaveBeenCalledWith('2026-W53', { kmPerDay: 0 });
    });

    it.each([
      ['2027-W53', 'W53 of a 52-week ISO year'],
      ['2026-W00', 'week 0'],
      ['2026-W54', 'week 54'],
      ['2026-W5', 'one-digit week'],
      ['2026-05', 'the old YYYY-MM month key'],
    ])('400 on path key %s (%s)', async (key, _why) => {
      const res = await http()
        .put(`/api/v1/limits/${key}`)
        .set('x-test-role', 'admin')
        .send({ kmPerDay: 300 })
        .expect(400);
      expect(res.body.type).toBe('/problems/validation');
      expect(service.upsert).not.toHaveBeenCalled();
    });

    it.each([
      [{}, 'no value at all'],
      [{ kmPerDay: -1 }, 'negative value'],
      [{ ratePerKm: 'abc' }, 'not a number'],
    ])('400 on body %j (%s)', async (body, _why) => {
      await http().put('/api/v1/limits/2026-W23').set('x-test-role', 'admin').send(body).expect(400);
      expect(service.upsert).not.toHaveBeenCalled();
    });
  });

  // ── POST /limits/bulk ──

  describe('POST /limits/bulk', () => {
    it('200 (not 201) for admin, body forwarded', async () => {
      const res = await http()
        .post('/api/v1/limits/bulk')
        .set('x-test-role', 'admin')
        .send({ isoYear: 2026, weeks: [10, 11, 53], kmPerDay: 0 })
        .expect(200);
      expect(res.body).toEqual([ROW]);
      expect(service.bulkUpsert).toHaveBeenCalledWith({ isoYear: 2026, weeks: [10, 11, 53], kmPerDay: 0 });
    });

    it.each([
      [{ isoYear: 2026, weeks: [], kmPerDay: 0 }, 'empty weeks'],
      [{ isoYear: 2027, weeks: [52, 53], kmPerDay: 0 }, 'W53 of a 52-week ISO year'],
      [{ isoYear: 2026, weeks: [10, 10], kmPerDay: 0 }, 'duplicate week'],
      [{ isoYear: 2026, weeks: [0], kmPerDay: 0 }, 'week 0'],
      [{ isoYear: 2026, weeks: [10] }, 'no value at all'],
      [{ isoYear: 2026, weeks: [10], kmPerDay: -5 }, 'negative value'],
      [{ year: 2026, months: [1, 2], kmPerDay: 0 }, 'the old monthly body'],
      [{ isoYear: 2026, weeks: [10], kmPerDay: 0, months: [1] }, 'unknown key (strict)'],
    ])('400 on %j (%s)', async (body, _why) => {
      const res = await http().post('/api/v1/limits/bulk').set('x-test-role', 'admin').send(body).expect(400);
      expect(res.body.type).toBe('/problems/validation');
      expect(service.bulkUpsert).not.toHaveBeenCalled();
    });
  });

  // ── gate ──

  describe('authorization (limits.manage — admin only)', () => {
    const calls: Array<[string, () => request.Test]> = [
      ['GET /limits', () => http().get('/api/v1/limits?year=2026')],
      ['PUT /limits/:isoWeek', () => http().put('/api/v1/limits/2026-W23').send({ kmPerDay: 1 })],
      ['POST /limits/bulk', () => http().post('/api/v1/limits/bulk').send({ isoYear: 2026, weeks: [1], kmPerDay: 1 })],
    ];

    const expectServiceUntouched = (): void => {
      expect(service.listForIsoYear).not.toHaveBeenCalled();
      expect(service.upsert).not.toHaveBeenCalled();
      expect(service.bulkUpsert).not.toHaveBeenCalled();
    };

    it.each(calls)('401 without authentication: %s', async (_name, call) => {
      await call().expect(401);
      expectServiceUntouched();
    });

    it.each(calls.flatMap(([name, call]) => NON_ADMIN_ROLES.map((role) => [name, role, call] as const)))(
      '403: %s as %s',
      async (_name, role, call) => {
        await call().set('x-test-role', role).expect(403);
        expectServiceUntouched();
      },
    );
  });
});
