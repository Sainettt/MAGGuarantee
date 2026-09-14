import { Injectable, Logger } from '@nestjs/common';

import { describeError } from '../../common/ops-alert/redact';
import { RedisService } from '../redis/redis.service';
import type { MailCompensation } from './email-send.job';

/** Validates + applies one compensation payload. Must be idempotent. */
export type MailCompensationHandler = (payload: unknown) => Promise<void>;

export type CompensationResult =
  | 'compensated'
  | 'batch-pending'
  | 'no-handler'
  | 'handler-failed';

/** Batch failure counters outlive the job retention window. */
const BATCH_COUNTER_TTL_SEC = 14 * 24 * 60 * 60;
const BATCH_COUNTER_PREFIX = 'mail:compensation:batch:';

/**
 * Registry of "undo" handlers for state a producer committed before its email
 * was delivered (2026-08-14 logging audit, item 6).
 *
 * The problem it solves: the guarantee watchdog and the vehicle-removal alert
 * dedupe by stamping "notified" columns. Stamping on enqueue means a mail that
 * later fails permanently still counts as sent, and the next run never retries.
 * Producers therefore CLAIM the stamp, enqueue with a `MailCompensation`, and
 * the email processor's final-failure handler calls back here to RELEASE it.
 *
 * Producers register in `onModuleInit`; the registry lives in MailModule, which
 * they import anyway, so there is no module cycle. Handlers receive `unknown`
 * (the payload round-tripped through Redis) and must validate it.
 */
@Injectable()
export class MailCompensationRegistry {
  private readonly logger = new Logger(MailCompensationRegistry.name);
  private readonly handlers = new Map<string, MailCompensationHandler>();

  constructor(private readonly redis: RedisService) {}

  register(kind: string, handler: MailCompensationHandler): void {
    if (this.handlers.has(kind)) {
      this.logger.warn({ msg: 'mail compensation handler replaced', kind });
    }
    this.handlers.set(kind, handler);
  }

  /**
   * Called once per job that failed PERMANENTLY. For a batch, counts the
   * failure and runs the handler only when every job of the batch has failed —
   * one delivered copy keeps the shared stamp.
   */
  async onFinalFailure(
    compensation: MailCompensation,
    jobId: string | null,
  ): Promise<CompensationResult> {
    const handler = this.handlers.get(compensation.kind);
    if (!handler) {
      this.logger.error({
        msg: 'mail compensation: no handler registered — stamp NOT released',
        kind: compensation.kind,
        jobId,
      });
      return 'no-handler';
    }
    if (compensation.batch && compensation.batch.size > 1) {
      const failed = await this._countBatchFailure(compensation.batch.id);
      if (failed < compensation.batch.size) {
        this.logger.log({
          msg: 'mail compensation: batch not fully failed yet, stamp kept',
          kind: compensation.kind,
          batchId: compensation.batch.id,
          failed,
          size: compensation.batch.size,
          jobId,
        });
        return 'batch-pending';
      }
    }
    try {
      await handler(compensation.payload);
      this.logger.warn({
        msg: 'mail compensation applied — producer state released for retry',
        kind: compensation.kind,
        jobId,
      });
      return 'compensated';
    } catch (err) {
      this.logger.error({
        msg: 'mail compensation handler failed — stamp may still claim delivery',
        kind: compensation.kind,
        jobId,
        ...describeError(err),
      });
      return 'handler-failed';
    }
  }

  private async _countBatchFailure(batchId: string): Promise<number> {
    const key = `${BATCH_COUNTER_PREFIX}${batchId}`;
    const failed = await this.redis.incr(key);
    await this.redis.expire(key, BATCH_COUNTER_TTL_SEC);
    return failed;
  }
}
