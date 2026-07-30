// Phase 9 — `/ready` readiness probe. The contract monitors depend on:
// 200 when both dependencies answer, 503 (same body shape) when either does
// not, and never a 500 — a probe that throws is a probe that lies.

import { ServiceUnavailableException } from '@nestjs/common';

import type { PrismaService } from '../modules/prisma/prisma.service';
import type { RedisService } from '../modules/redis/redis.service';
import {
  ReadinessController,
  type ReadinessResponse,
} from './readiness.controller';

function makePrisma(behaviour: 'ok' | 'down'): PrismaService {
  const queryRaw =
    behaviour === 'ok'
      ? jest.fn(async () => [{ '?column?': 1 }])
      : jest.fn(async () => {
          throw new Error('ECONNREFUSED 127.0.0.1:5432');
        });
  return { tx: { $queryRaw: queryRaw } } as unknown as PrismaService;
}

function makeRedis(behaviour: 'ok' | 'down' | 'garbage'): RedisService {
  const ping =
    behaviour === 'ok'
      ? jest.fn(async () => 'PONG')
      : behaviour === 'garbage'
        ? jest.fn(async () => 'LOADING')
        : jest.fn(async () => {
            throw new Error('connection lost');
          });
  return { ping } as unknown as RedisService;
}

/** Runs the handler and returns the 503 body the client would receive. */
async function expectDegraded(
  controller: ReadinessController,
): Promise<ReadinessResponse> {
  try {
    await controller.get();
  } catch (err) {
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    const e = err as ServiceUnavailableException;
    expect(e.getStatus()).toBe(503);
    return e.getResponse() as ReadinessResponse;
  }
  throw new Error('expected a 503, but the probe reported ready');
}

describe('ReadinessController', () => {
  it('reports ok when Postgres and Redis both answer', async () => {
    const c = new ReadinessController(makePrisma('ok'), makeRedis('ok'));
    const res = await c.get();

    expect(res.status).toBe('ok');
    expect(res.checks.db.ok).toBe(true);
    expect(res.checks.redis.ok).toBe(true);
    expect(res.checks.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(res.timestamp)).not.toBeNaN();
  });

  it('503s with the failing dependency named when Postgres is down', async () => {
    const c = new ReadinessController(makePrisma('down'), makeRedis('ok'));
    const body = await expectDegraded(c);

    expect(body.status).toBe('degraded');
    expect(body.checks.db.ok).toBe(false);
    // The healthy dependency still reports — that's what makes the body useful.
    expect(body.checks.redis.ok).toBe(true);
  });

  it('503s when Redis is down', async () => {
    const c = new ReadinessController(makePrisma('ok'), makeRedis('down'));
    const body = await expectDegraded(c);

    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(false);
  });

  it('treats a non-PONG reply as not-ready (e.g. Redis still LOADING)', async () => {
    const c = new ReadinessController(makePrisma('ok'), makeRedis('garbage'));
    const body = await expectDegraded(c);
    expect(body.checks.redis.ok).toBe(false);
  });

  it('503s (not 500) when both dependencies are down', async () => {
    const c = new ReadinessController(makePrisma('down'), makeRedis('down'));
    const body = await expectDegraded(c);

    expect(body.checks.db.ok).toBe(false);
    expect(body.checks.redis.ok).toBe(false);
  });
});
