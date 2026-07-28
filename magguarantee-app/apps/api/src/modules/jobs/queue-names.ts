/**
 * Canonical BullMQ queue names. Imported by producers, processors, and
 * `BullModule.registerQueue(...)` calls so the queue identifiers are never
 * stringly-typed at the call site (no-magic-strings rule).
 *
 * Phase 9 (early / in-process) — one queue is live today:
 *   - `email-send` — async transactional email (2FA login code only for now;
 *                    the rest of the mail call-sites stay synchronous until
 *                    the full Phase 9 migration).
 *
 * See docs/16-jobs-and-integrations.md#background-jobs-cron--bullmq.
 */
export const QUEUE_EMAIL_SEND = 'email-send' as const;
