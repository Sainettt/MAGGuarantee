import type { Job } from 'bullmq';

import { describeError } from '../../common/ops-alert/redact';

/**
 * Structured view of one failed BullMQ attempt, as seen from a worker's
 * `failed` event (2026-08-14 logging audit, item 6).
 */
export interface JobFailureSummary {
  jobId: string | null;
  queue: string;
  jobName: string | null;
  /** Attempts made INCLUDING the one that just failed. */
  attemptsMade: number;
  maxAttempts: number;
  /** No retry will follow — BullMQ moved the job to the failed set. */
  final: boolean;
  errorName: string;
  errorMessage: string;
}

/**
 * True when BullMQ will not retry this job again.
 *
 * Mirrors `Job.shouldRetryJob` (bullmq 5): a retry happens only while
 * `attemptsMade + 1 < attempts` and the error is not an `UnrecoverableError`.
 * The worker emits `failed` AFTER `moveToFailed` has incremented
 * `attemptsMade`, so at event time the check is `attemptsMade >= attempts`.
 */
export function isFinalFailure(job: Job | undefined, err: unknown): boolean {
  if (!job) return true;
  if (err instanceof Error && err.name === 'UnrecoverableError') return true;
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

export function summarizeJobFailure(
  queue: string,
  job: Job | undefined,
  err: unknown,
): JobFailureSummary {
  const { errorName, errorMessage } = describeError(err);
  return {
    jobId: job?.id ?? null,
    queue,
    jobName: job?.name ?? null,
    attemptsMade: job?.attemptsMade ?? 0,
    maxAttempts: job?.opts.attempts ?? 1,
    final: isFinalFailure(job, err),
    errorName,
    errorMessage,
  };
}
