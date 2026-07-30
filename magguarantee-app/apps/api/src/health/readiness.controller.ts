import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { Public } from '../modules/auth/decorators/public.decorator';
import { PrismaService } from '../modules/prisma/prisma.service';
import { RedisService } from '../modules/redis/redis.service';

/** One dependency probe result. */
export interface ReadinessCheck {
  ok: boolean;
  latencyMs: number;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  checks: {
    db: ReadinessCheck;
    redis: ReadinessCheck;
  };
  timestamp: string;
}

/**
 * Readiness probe — "can this instance serve traffic?", as opposed to
 * `/health`, which only answers "is the process alive?".
 *
 * A live container with a dead Postgres passes `/health` and fails every real
 * request; that gap is what this endpoint closes. Consumers (docs/16
 * §Мониторинг, docs/18):
 *  - Uptime Kuma pings it once a minute and alerts on a non-200;
 *  - the post-deploy smoke test curls it before declaring a release good;
 *  - a compose/orchestrator healthcheck can gate traffic on it.
 *
 * Contract: **200** when both dependencies answer, **503** when either does
 * not — the body is the same shape either way, so a monitor can show WHICH
 * dependency broke. `@Public()` (no auth: a probe must work without a token)
 * and no `@Audit()` (read-only). Excluded from the global `/api/v1` prefix in
 * `main.ts`, so the path is exactly `/ready`.
 *
 * Both probes run concurrently and neither throws: a failure is a `false` in
 * the body, never a 500.
 */
@Controller('ready')
export class ReadinessController {
  private readonly logger = new Logger(ReadinessController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async get(): Promise<ReadinessResponse> {
    const [db, redis] = await Promise.all([
      this._probeDb(),
      this._probeRedis(),
    ]);
    const ok = db.ok && redis.ok;
    if (!ok) {
      // 503 = NOT ready, with the diagnostic body preserved: Nest uses a
      // non-string exception payload as the response body verbatim, so the
      // ready and degraded responses stay the same shape.
      throw new ServiceUnavailableException({
        status: 'degraded' as const,
        checks: { db, redis },
        timestamp: new Date().toISOString(),
      });
    }
    return {
      status: 'ok',
      checks: { db, redis },
      timestamp: new Date().toISOString(),
    };
  }

  private async _probeDb(): Promise<ReadinessCheck> {
    const start = Date.now();
    try {
      await this.prisma.tx.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error({
        msg: 'readiness: postgres ping failed',
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  private async _probeRedis(): Promise<ReadinessCheck> {
    const start = Date.now();
    try {
      const reply = await this.redis.ping();
      return { ok: reply === 'PONG', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error({
        msg: 'readiness: redis ping failed',
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}
