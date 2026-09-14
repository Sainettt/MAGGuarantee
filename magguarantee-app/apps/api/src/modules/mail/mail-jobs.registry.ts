import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

/**
 * Redis-backed ring buffer that records every email send so the admin
 * diagnostics page (`GET /api/v1/diagnostics/mails`) and resend endpoint
 * have a job-like surface to work against — without taking a BullMQ
 * dependency before Phase 9 (`docs/16-jobs-and-integrations.md#email-очередь`).
 *
 * Storage shape:
 *   - LIST  `mail:jobs:list`         — most-recent job ids first.
 *   - HASH  `mail:jobs:job:<id>`     — serialised job record (TTL: 14 days).
 *
 * The registry is intentionally minimal: id, state (`completed`/`failed`),
 * attemptsMade, optional failedReason, plus the redacted display payload
 * (`to` / `subject` / `template`). The full email body is NOT persisted —
 * the admin UI only renders metadata, and re-sending uses MailService's
 * own template constructors.
 *
 * BullMQ landed (Phase 9): rows are written by `MailService._dispatch` from
 * inside the `email-send` worker, one row per job (see `record`). The durable
 * per-email delivery record is the `email_logs` table; this ring buffer stays
 * the short-lived diagnostics view behind the resend button.
 */

const LIST_KEY = 'mail:jobs:list';
const JOB_PREFIX = 'mail:jobs:job:';
/** Hold the most recent 200 job ids — bounded so the LIST never grows unbounded. */
const LIST_CAP = 200;
/** Per-job TTL: 14 days is more than enough for an admin to chase failed sends. */
const JOB_TTL_SEC = 60 * 60 * 24 * 14;

export type MailJobState = 'completed' | 'failed' | 'unknown';

export interface MailJobPayload {
  to: string;
  subject: string;
  /** Free-form template tag (`2fa-code`, `maksim-confirmation-request`, ...). */
  template: string | null;
  /**
   * Stub for future template-data persistence. Currently unused on the
   * read path (the diagnostics endpoint redacts everything but the display
   * fields). Resend uses the explicit `template` tag to pick a re-builder
   * in `MailService`.
   */
  data?: Record<string, unknown>;
}

export interface MailJobRecord {
  id: string;
  state: MailJobState;
  attemptsMade: number;
  failedReason: string | null;
  data: MailJobPayload;
  createdAt: string;
}

@Injectable()
export class MailJobsRegistry {
  private readonly logger = new Logger(MailJobsRegistry.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Record a send attempt.
   *
   * With an `id` (a queued job — `job-<bullmqJobId>`) the row is UPSERTED:
   * every attempt of the same job overwrites one record with the current state
   * and the real `attemptsMade`, and the id moves to the head of the list
   * (LREM + LPUSH, so it is never listed twice). Without an `id` (sync fallback,
   * admin resend) a fresh random id is used, as before. (2026-08-14 logging
   * audit, item 23 — the old behaviour wrote one row per attempt, each with
   * `attemptsMade: 1`.)
   *
   * `failedReason` must already be scrubbed by the caller (`describeError`).
   */
  async record(args: {
    id?: string;
    payload: MailJobPayload;
    state: MailJobState;
    failedReason?: string;
    attemptsMade?: number;
  }): Promise<MailJobRecord> {
    const id = args.id ?? randomUUID();
    const record: MailJobRecord = {
      id,
      state: args.state,
      attemptsMade: args.attemptsMade ?? 1,
      failedReason: args.failedReason ?? null,
      data: args.payload,
      createdAt: new Date().toISOString(),
    };
    try {
      const client = this.redis.client;
      await client.setex(
        `${JOB_PREFIX}${id}`,
        JOB_TTL_SEC,
        JSON.stringify(record),
      );
      if (args.id) await client.lrem(LIST_KEY, 0, id);
      await client.lpush(LIST_KEY, id);
      await client.ltrim(LIST_KEY, 0, LIST_CAP - 1);
    } catch (err) {
      // Redis hiccups should never break a mail send (the email may have
      // already gone out). Log and drop the record — the diagnostics view
      // can tolerate a missing row better than the user can tolerate a
      // 500 on an otherwise successful send.
      this.logger.warn({
        msg: 'mail jobs registry: record failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return record;
  }

  /**
   * Return the most recent N jobs, newest first. Missing-or-expired entries
   * are skipped silently — the LIST may outlive its HASH entries because
   * we cap at 200 ids but only keep job rows for 14 days.
   */
  async listRecent(limit: number): Promise<MailJobRecord[]> {
    let ids: string[];
    try {
      ids = await this.redis.client.lrange(LIST_KEY, 0, limit - 1);
    } catch (err) {
      this.logger.warn({
        msg: 'mail jobs registry: list failed',
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
    if (ids.length === 0) return [];

    const records: MailJobRecord[] = [];
    for (const id of ids) {
      const raw = await this.redis.get(`${JOB_PREFIX}${id}`);
      if (!raw) continue;
      try {
        records.push(JSON.parse(raw) as MailJobRecord);
      } catch {
        // Corrupt JSON (very unlikely — we wrote it ourselves); skip.
        continue;
      }
    }
    return records;
  }

  async findById(id: string): Promise<MailJobRecord | null> {
    const raw = await this.redis.get(`${JOB_PREFIX}${id}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MailJobRecord;
    } catch {
      return null;
    }
  }
}
