import type { KeepJobs } from 'bullmq';

const DAY_SEC = 24 * 60 * 60;

/**
 * Retention of finished BullMQ jobs in Redis (2026-08-14 logging audit, items
 * 5 + 24). BullMQ's `age` is in SECONDS; `count` caps the set regardless of
 * age so a burst cannot grow Redis without bound.
 *
 * `removeOnFail: false` (the old value) kept every failed job forever — with
 * its payload, in a Redis that is persisted to disk. Failed jobs are now kept
 * long enough to investigate (the durable record is the `email_logs` row and
 * the ops alert), then dropped.
 */
export const JOB_REMOVE_ON_COMPLETE: KeepJobs = { age: 7 * DAY_SEC, count: 1000 };
export const JOB_REMOVE_ON_FAIL: KeepJobs = { age: 14 * DAY_SEC, count: 500 };
