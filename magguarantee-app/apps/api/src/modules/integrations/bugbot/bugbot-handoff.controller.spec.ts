// HTTP contract of `GET /api/v1/integrations/bugbot/handoff`
// (docs/13-api-design.md#external-integrations): exact path, 200 + no-store,
// query validation (400), 401 / 403 / 404, no `@Audit`, and the throttling
// split — global 100/min/IP untouched, per-user bucket on top.
//
// The guard chain mirrors app.module.ts: ThrottlerGuard → auth → RolesGuard as
// APP_GUARDs, then the controller's own BugbotHandoffThrottlerGuard. The real
// service signs with a key pair generated for this run.

import 'reflect-metadata';

import { generateKeyPairSync } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

import { AUDIT_METADATA_KEY } from '../../../common/audit/audit.constants';
import { ProblemDetailsFilter } from '../../../common/errors/problem-details.filter';
import type { Env } from '../../../config/env.schema';
import { ROLES_METADATA_KEY } from '../../auth/auth.constants';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { BugbotHandoffThrottlerGuard } from './bugbot-handoff-throttler.guard';
import {
  BUGBOT_HANDOFF_RATE_LIMIT,
  BUGBOT_HANDOFF_THROTTLER_NAME,
} from './bugbot-handoff.constants';
import { BugbotHandoffController } from './bugbot-handoff.controller';
import { BugbotHandoffService } from './bugbot-handoff.service';

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
    req.user = {
      sub: req.headers['x-test-user'] ?? 'u-1',
      login: 'u',
      email: 'u@magtrans.eu',
      name: 'U',
      role,
      mustChangePassword: false,
    };
    return true;
  }
}

const GLOBAL_LIMIT = 100;
const KEYS = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function makeConfig(enabled: boolean): ConfigService<Env, true> {
  const values: Partial<Record<keyof Env, unknown>> = enabled
    ? {
        BUGBOT_URL: 'https://bugbot.example.test',
        BUGBOT_PROJECT_SLUG: 'magguarantee',
        BUGBOT_HANDOFF_KID: 'mg-test',
        BUGBOT_HANDOFF_PRIVATE_KEY: KEYS.privateKey,
      }
    : { BUGBOT_PROJECT_SLUG: 'magguarantee' };
  return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;
}

async function boot(enabled: boolean): Promise<INestApplication> {
  // The service logs at construction (before `logger: false` below applies).
  Logger.overrideLogger(false);
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: GLOBAL_LIMIT }])],
    controllers: [BugbotHandoffController],
    providers: [
      { provide: BugbotHandoffService, useValue: new BugbotHandoffService(makeConfig(enabled)) },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProblemDetailsFilter());
  await app.init();
  return app;
}

function claimsOf(url: string): Record<string, unknown> {
  const token = new URL(url).searchParams.get('token') ?? '';
  return new JwtService({}).verify<Record<string, unknown>>(token, {
    publicKey: KEYS.publicKey,
    algorithms: ['ES256'],
    audience: 'bugbot',
    issuer: 'magguarantee',
  });
}

describe('BugbotHandoffController (HTTP)', () => {
  const path = '/api/v1/integrations/bugbot/handoff';
  let app: INestApplication;

  beforeAll(async () => {
    app = await boot(true);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['admin', 'pracownik', 'opiekun', 'planista', 'dyspozytor', 'przewoznik', 'eksport', 'weryfikator'])(
    '200 for %s with a bug report, no-store, defaults kind=bug locale=pl',
    async (role) => {
      const res = await request(app.getHttpServer()).get(path).set('x-test-role', role).expect(200);

      expect(Object.keys(res.body)).toEqual(['url']);
      expect(res.body.url).toMatch(/^https:\/\/bugbot\.example\.test\/p\/magguarantee\/auth\/callback\?token=/);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(claimsOf(res.body.url)).toEqual(
        expect.objectContaining({ kind: 'bug', locale: 'pl', roles: [role] }),
      );
    },
  );

  it('passes kind and locale from the query', async () => {
    const res = await request(app.getHttpServer())
      .get(`${path}?kind=idea&locale=en`)
      .set('x-test-role', 'admin')
      .expect(200);

    expect(claimsOf(res.body.url)).toEqual(expect.objectContaining({ kind: 'idea', locale: 'en' }));
  });

  it.each(['pracownik', 'opiekun', 'przewoznik'])('403 for kind=idea as %s', async (role) => {
    const res = await request(app.getHttpServer())
      .get(`${path}?kind=idea`)
      .set('x-test-role', role)
      .expect(403);

    expect(res.body.type).toBe('/problems/forbidden');
    expect(res.body).not.toHaveProperty('url');
  });

  it('401 without authentication', async () => {
    await request(app.getHttpServer()).get(path).expect(401);
  });

  it.each(['kind=feature', 'locale=de', 'kind=', 'token=abc', 'sub=someone-else'])(
    '400 on an invalid query (%s)',
    async (qs) => {
      const res = await request(app.getHttpServer())
        .get(`${path}?${qs}`)
        .set('x-test-role', 'admin')
        .expect(400);

      expect(res.body.type).toBe('/problems/validation');
    },
  );

  it('keeps the global 100/min/IP limit and adds the per-user one', async () => {
    const res = await request(app.getHttpServer()).get(path).set('x-test-role', 'admin').expect(200);

    // The global guard did not pick up a 10/min override for this route…
    expect(res.headers['x-ratelimit-limit']).toBe(String(GLOBAL_LIMIT));
    // …and the per-user bucket is there on top.
    expect(res.headers[`x-ratelimit-limit-${BUGBOT_HANDOFF_THROTTLER_NAME}`]).toBe(
      String(BUGBOT_HANDOFF_RATE_LIMIT.limit),
    );
  });

  it('counts the per-user bucket per user, not per IP', async () => {
    const remaining = async (userId: string): Promise<number> => {
      const res = await request(app.getHttpServer())
        .get(path)
        .set('x-test-role', 'admin')
        .set('x-test-user', userId)
        .expect(200);
      return Number(res.headers[`x-ratelimit-remaining-${BUGBOT_HANDOFF_THROTTLER_NAME}`]);
    };

    const first = await remaining('per-user-a');
    expect(await remaining('per-user-a')).toBe(first - 1);
    // Same client IP (supertest), different user → a fresh bucket.
    expect(await remaining('per-user-b')).toBe(first);
  });

  it('carries no @Audit, no @Roles and no @Throttle override; mounts the per-user guard', () => {
    const reflector = new Reflector();
    const handler = BugbotHandoffController.prototype.createHandoff;
    for (const target of [handler, BugbotHandoffController]) {
      expect(reflector.get(AUDIT_METADATA_KEY, target)).toBeUndefined();
      expect(reflector.get(ROLES_METADATA_KEY, target)).toBeUndefined();
      expect(reflector.get('THROTTLER:LIMITdefault', target)).toBeUndefined();
      expect(reflector.get('THROTTLER:TTLdefault', target)).toBeUndefined();
    }
    expect(reflector.get(GUARDS_METADATA, BugbotHandoffController)).toEqual([BugbotHandoffThrottlerGuard]);
  });

  describe('integration not configured', () => {
    let offApp: INestApplication;

    beforeAll(async () => {
      offApp = await boot(false);
    });

    afterAll(async () => {
      await offApp.close();
    });

    it('404 as ProblemDetails', async () => {
      const res = await request(offApp.getHttpServer()).get(path).set('x-test-role', 'admin').expect(404);

      expect(res.body.type).toBe('/problems/not-found');
      expect(res.body.status).toBe(404);
    });

    it('still 401 without authentication', async () => {
      await request(offApp.getHttpServer()).get(path).expect(401);
    });
  });
});
