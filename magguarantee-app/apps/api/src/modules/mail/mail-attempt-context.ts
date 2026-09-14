import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-attempt context of an `email-send` job, visible to `MailService` while
 * the processor runs a dispatch (2026-08-14 logging audit, items 11 + 23).
 *
 * Why AsyncLocalStorage rather than extra parameters on the 22 public
 * `sendX(email, props)` methods: the context is a transport concern (which
 * BullMQ job, which attempt), not part of what a caller asks for, and the same
 * pattern already carries the audit transaction (`AuditContext`).
 *
 * Direction of flow:
 *  - processor → MailService: `jobId`, `attempt`, `maxAttempts` — so the
 *    diagnostics registry keeps ONE row per job and log lines correlate;
 *  - MailService → processor: `subject`, `providerMessageId` — written by the
 *    send path, read back for the `email_logs` row.
 *
 * Outside a job (sync fallback in unit tests / scripts) there is no store and
 * `MailService` behaves exactly as before.
 */
export interface MailAttemptContext {
  jobId: string;
  /** 1-based number of the attempt in progress. */
  attempt: number;
  maxAttempts: number;
  subject: string | null;
  providerMessageId: string | null;
}

export const mailAttemptStorage = new AsyncLocalStorage<MailAttemptContext>();
