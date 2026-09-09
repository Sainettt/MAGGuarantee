// Small shared state the directory feature keeps in Redis (docs/24 §A4/§A5).
//
// Redis rather than a table: this is operational telemetry — when did the
// reconcile last finish, how long has MAGSpace been unreachable — not domain
// data. Losing it on a flush costs one warning line and one delayed alert; a
// migration for it would cost more than it is worth.

import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

const LAST_RUN_KEY = 'directory:reconcile:lastRunAt';
const FIRST_FAILURE_KEY = 'directory:reconcile:firstFailureAt';
const FAILURE_ALERTED_KEY = 'directory:reconcile:failureAlerted';

/**
 * Kept well beyond any plausible reconcile interval so `lastReconcileAt` still
 * reads "yesterday" after a night with the job disabled — a stale timestamp is
 * informative, a missing one is ambiguous.
 */
const LAST_RUN_TTL_SEC = 30 * 24 * 60 * 60;
/** Outage bookkeeping is only interesting while the outage lasts. */
const FAILURE_TTL_SEC = 7 * 24 * 60 * 60;

@Injectable()
export class DirectoryState {
  constructor(private readonly redis: RedisService) {}

  async markReconcileRun(at: Date): Promise<void> {
    await this.redis.setex(LAST_RUN_KEY, LAST_RUN_TTL_SEC, at.toISOString());
  }

  async lastReconcileAt(): Promise<Date | null> {
    const raw = await this.redis.get(LAST_RUN_KEY);
    if (!raw) return null;
    const at = new Date(raw);
    return Number.isNaN(at.getTime()) ? null : at;
  }

  /**
   * Records that a run could not reach MAGSpace and reports how long the outage
   * has been going. The first failure stamps the clock; later ones read it back,
   * which is what lets the cron alert on "down for more than 2 hours" without
   * keeping any in-process state (and therefore without resetting on a deploy).
   */
  async recordFailure(now: Date): Promise<{ since: Date; alreadyAlerted: boolean }> {
    const claimed = await this.redis.client.set(
      FIRST_FAILURE_KEY,
      now.toISOString(),
      'EX',
      FAILURE_TTL_SEC,
      'NX',
    );
    const raw = claimed === 'OK' ? now.toISOString() : await this.redis.get(FIRST_FAILURE_KEY);
    const since = raw ? new Date(raw) : now;
    const alreadyAlerted = await this.redis.exists(FAILURE_ALERTED_KEY);
    return {
      since: Number.isNaN(since.getTime()) ? now : since,
      alreadyAlerted,
    };
  }

  /** One alert per outage, not one per failed run. */
  async markFailureAlerted(): Promise<void> {
    await this.redis.setex(FAILURE_ALERTED_KEY, FAILURE_TTL_SEC, '1');
  }

  /** Called after any successful run — the outage, if there was one, is over. */
  async clearFailure(): Promise<void> {
    await this.redis.del(FIRST_FAILURE_KEY, FAILURE_ALERTED_KEY);
  }
}
