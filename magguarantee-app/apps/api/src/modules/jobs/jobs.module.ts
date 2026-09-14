import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import type { Env } from '../../config/env.schema';
import { JOB_REMOVE_ON_COMPLETE, JOB_REMOVE_ON_FAIL } from './job-retention';

/**
 * Root BullMQ wiring (in-process workers).
 *
 * Phase 9 stood up early: the API process hosts BOTH the producers and the
 * processors (no separate worker container). `BullModule.forRootAsync` opens
 * the shared connection used by every queue + worker registered downstream
 * via `BullModule.registerQueue(...)` (mail / chat feature modules).
 *
 * Connection: derived from the existing `REDIS_URL` env var (same instance the
 * 2FA / mail-jobs-registry already use). A DEDICATED BullMQ connection is used
 * (`maxRetriesPerRequest: null`) — BullMQ blocks on `BRPOPLPUSH`, which ioredis
 * forbids on a connection with a finite `maxRetriesPerRequest`, so we must NOT
 * reuse `RedisService.client` (that one keeps `maxRetriesPerRequest: 3`).
 *
 * Connection errors: with `connection` given as OPTIONS (not an ioredis
 * instance) every Queue and Worker opens its own client and re-emits that
 * client's errors as its own `error` event. The listeners live next to the
 * queue they belong to — each `@Processor` attaches a rate-limited
 * `ConnectionErrorReporter` to its worker (`@OnWorkerEvent('error')`) and to
 * its queue (`onModuleInit`). An unlistened `error` would otherwise surface as
 * an uncaught exception / unstructured stderr.
 *
 * `@Global()` so feature modules can `BullModule.registerQueue(...)` without
 * re-importing the root config.
 *
 * See docs/16-jobs-and-integrations.md#структура-bullmq.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          url: config.get('REDIS_URL', { infer: true }),
          // REQUIRED by BullMQ's blocking commands — see note above.
          maxRetriesPerRequest: null,
        },
        // Shared retention defaults; per-job overrides win (the chat producer
        // sets its own attempts/backoff/jobId and inherits these). Failed jobs
        // are no longer kept forever — see job-retention.ts.
        defaultJobOptions: {
          removeOnComplete: JOB_REMOVE_ON_COMPLETE,
          removeOnFail: JOB_REMOVE_ON_FAIL,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class JobsModule {}
