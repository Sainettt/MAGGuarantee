import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

import type { Env } from '../../config/env.schema';

/**
 * Thin ioredis wrapper used as the storage layer for:
 *  - 2FA codes (`2fa:code:{sessionToken}`)
 *  - 2FA attempt counters (`2fa:attempts:{sessionToken}`)
 *  - 2FA lockout markers (`2fa:lockout:{sessionToken}`)
 *  - 2FA resend cooldown (`2fa:resend:{sessionToken}`)
 *  - sessionToken → userId mapping (`2fa:session:{sessionToken}`)
 *
 * Key shapes are non-negotiable per docs/15-auth-strategy.md#2fa.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new IORedis(config.get('REDIS_URL', { infer: true }), {
      // ioredis defaults are fine for Phase 1 (single-node, no Sentinel).
      // We only override `lazyConnect: false` (the default) for clarity.
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
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
