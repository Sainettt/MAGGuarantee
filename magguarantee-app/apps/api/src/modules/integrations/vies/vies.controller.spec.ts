// HTTP-level contract for the VIES lookup after the 2026-09-14 move from a
// path-param VAT number to a POST body (logging audit, item 2): exact path,
// 200 (not 201), body validation, role gate, no @Audit, throttle kept.

import 'reflect-metadata';

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import type { ViesLookupResponse } from '@magguarantee/shared';

import { AUDIT_METADATA_KEY } from '../../../common/audit/audit.constants';
import { ProblemDetailsFilter } from '../../../common/errors/problem-details.filter';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ViesController } from './vies.controller';
import { ViesService } from './vies.service';

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

const RESULT: ViesLookupResponse = {
  countryCode: 'PL',
  vatNumber: '1234567890',
  valid: true,
  name: 'ACME',
  address: 'Warszawa',
  requestDate: '2026-09-14',
  cachedAt: null,
};

describe('ViesController (HTTP)', () => {
  const path = '/api/v1/integrations/vies/check';
  let app: INestApplication;
  const service = { lookup: jest.fn(async () => RESULT) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ViesController],
      providers: [
        { provide: ViesService, useValue: service },
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

  beforeEach(() => service.lookup.mockClear());

  it.each(['admin', 'opiekun'])('200 for %s, body forwarded to the service', async (role) => {
    const res = await request(app.getHttpServer())
      .post(path)
      .set('x-test-role', role)
      .send({ country: 'pl', vat: '1234567890' })
      .expect(200);

    expect(res.body).toEqual(RESULT);
    // Upper-casing is the service's job — the controller passes the body through.
    expect(service.lookup).toHaveBeenCalledWith('pl', '1234567890');
  });

  it('401 without authentication', async () => {
    await request(app.getHttpServer()).post(path).send({ country: 'PL', vat: '1234567890' }).expect(401);
    expect(service.lookup).not.toHaveBeenCalled();
  });

  it.each(['pracownik', 'przewoznik', 'planista', 'dyspozytor'])('403 for %s', async (role) => {
    await request(app.getHttpServer())
      .post(path)
      .set('x-test-role', role)
      .send({ country: 'PL', vat: '1234567890' })
      .expect(403);
    expect(service.lookup).not.toHaveBeenCalled();
  });

  it.each([
    [{ country: 'PL' }],
    [{ country: 'POL', vat: '1234567890' }],
    [{ country: 'PL', vat: '12' }],
    [{ country: 'PL', vat: '1234567890', extra: true }],
  ])('400 on an invalid body %j', async (body) => {
    const res = await request(app.getHttpServer())
      .post(path)
      .set('x-test-role', 'admin')
      .send(body)
      .expect(400);
    expect(res.body.type).toBe('/problems/validation');
    expect(service.lookup).not.toHaveBeenCalled();
  });

  it('the old GET path-param route is gone', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/vies/PL/1234567890')
      .set('x-test-role', 'admin')
      .expect(404);
  });

  it('is not audited (read-only lookup) and is throttled', () => {
    const reflector = new Reflector();
    const handler = ViesController.prototype.lookup;
    expect(reflector.get(AUDIT_METADATA_KEY, handler)).toBeUndefined();
    expect(reflector.get(AUDIT_METADATA_KEY, ViesController)).toBeUndefined();
    expect(reflector.get('THROTTLER:LIMITdefault', handler)).toEqual(expect.any(Number));
    expect(reflector.get('THROTTLER:TTLdefault', handler)).toBe(60_000);
  });
});
