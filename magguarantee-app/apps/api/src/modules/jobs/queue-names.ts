/**
 * Canonical BullMQ queue names. Imported by producers, processors, and
 * `BullModule.registerQueue(...)` calls so the queue identifiers are never
 * stringly-typed at the call site (no-magic-strings rule).
 *
 * Two queues are live, both with in-process workers in the API container:
 *   - `email-send`         — EVERY transactional email (22 templates, see
 *                            `mail/email-send.job.ts`). Secrets (2FA / reset
 *                            codes, temporary passwords) travel sealed with
 *                            AES-256-GCM, never in plaintext.
 *   - `chat-notify-wyjazd` — Google Chat wyjazd-registration notification.
 *                            Removed 2026-07-28, RESTORED 2026-08-07.
 *
 * Retention of finished jobs: `jobs/job-retention.ts`. Permanent failures are
 * logged, alerted (`common/ops-alert`) and, for mail, written to `email_logs`.
 *
 * See docs/16-jobs-and-integrations.md#background-jobs-cron--bullmq.
 */
export const QUEUE_EMAIL_SEND = 'email-send' as const;
export const QUEUE_CHAT_NOTIFY_WYJAZD = 'chat-notify-wyjazd' as const;
