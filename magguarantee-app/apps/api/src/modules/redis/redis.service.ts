import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

import { ConnectionErrorReporter } from '../../common/ops-alert/connection-error-reporter';
import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import type { Env } from '../../config/env.schema';

/**
 * Thin ioredis wrapper used as the storage layer for:
 *  - 2FA codes (`2fa:code:{sessionToken}`)
 *  - 2FA attempt counters (`2fa:attempts:{sessionToken}`)
 *  - 2FA lockout markers (`2fa:lockout:{sessionToken}`)
 *  - 2FA resend cooldown (`2fa:resend:{sessionToken}`)
 *  - sessionToken → userId mapping (`2fa:session:{sessionToken}`)
 *  - the diagnostics mail registry and mail-compensation batch counters
 *
 * Key shapes are non-negotiable per docs/15-auth-strategy.md#2fa.
 *
 * Connection errors (2026-08-14 logging audit, item 20): ioredis emits `error`
 * on every failed reconnect attempt. Without a listener each one becomes an
 * unstructured "[ioredis] Unhandled error event" on stderr; with the
 * rate-limited reporter it is one structured ERROR line per minute plus an ops
 * alert (itself deduped to one per 10 minutes).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(
    config: ConfigService<Env, true>,
    @Optional() alerts?: OpsAlertService,
  ) {
    this.client = new IORedis(config.get('REDIS_URL', { infer: true }), {
      // ioredis defaults are fine for Phase 1 (single-node, no Sentinel).
      // We only override `lazyConnect: false` (the default) for clarity.
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    const reporter = new ConnectionErrorReporter(this.logger, 'redis', alerts);
    this.client.on('error', (err: unknown) => reporter.report(err));
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    await this.client.setex(key, ttlSec, value);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSec: number): Promise<number> {
    return this.client.expire(key, ttlSec);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) > 0;
  }

  async pttl(key: string): Promise<number> {
    return this.client.pttl(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
