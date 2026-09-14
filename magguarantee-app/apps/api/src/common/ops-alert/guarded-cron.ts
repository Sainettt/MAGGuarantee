import type { Logger } from '@nestjs/common';

import type { OpsAlertService } from './ops-alert.service';
import { describeError, describeStack } from './redact';

export interface GuardedCronOptions {
  /** The `@Cron({ name })` of the job — the key of its log lines and alerts. */
  job: string;
  logger: Logger;
  alerts: OpsAlertService;
}

/**
 * Runs a scheduled job body with a structured failure boundary (2026-08-14
 * logging audit, item 20).
 *
 * Without it an exception escapes into `@nestjs/schedule`, which logs an
 * unstructured string and moves on — no job name, no duration, no alert. Here
 * the failure becomes one ERROR line (`job`, `durationMs`, error name, scrubbed
 * message and stack) plus an ops alert, and the promise RESOLVES: a cron tick
 * has no caller that could handle a rejection.
 */
export async function runGuardedCron(
  opts: GuardedCronOptions,
  body: () => Promise<void>,
): Promise<void> {
  const startedAt = Date.now();
  try {
    await body();
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const { errorName, errorMessage } = describeError(err);
    opts.logger.error({
      msg: 'cron job failed',
      job: opts.job,
      durationMs,
      errorName,
      errorMessage,
      stack: describeStack(err),
    });
    await opts.alerts.send({
      key: `cron-failed:${opts.job}`,
      severity: 'error',
      title: `Cron job failed: ${opts.job}`,
      fields: { job: opts.job, durationMs, errorName, errorMessage },
    });
  }
}
