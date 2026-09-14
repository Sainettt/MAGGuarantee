-- email_logs — durable delivery journal of the email-send queue
-- (logging/audit-trail audit 2026-08-14, item 11).
--
-- Until now the only trace of a sent / failed e-mail was the in-memory
-- mail-jobs registry (ring of 200, TTL 14 days) and pino lines — "did the
-- decision e-mail for wniosek X reach the carrier?" had no answer after a
-- restart. This table keeps ONE row per e-mail job on its FINAL outcome:
--   status = 'sent'   — the provider accepted the message (sentAt, providerMessageId);
--   status = 'failed' — BullMQ retries exhausted (errorName, errorMessage).
-- Intermediate retries produce no rows; `attempts` carries the count.
--
-- Written by the api email processor (a later step). Write-once: no updatedAt,
-- no deletedAt. The api prunes rows older than EMAIL_LOG_RETENTION_DAYS
-- (default 180) with a plain DELETE — the audit_log append-only trigger does
-- NOT apply to this table.
--
-- Data-minimisation, non-negotiable: there are NO columns for the message body,
-- template props, 2FA / password-reset codes, temporary passwords or tokens, and
-- none may be added. `errorMessage` must be short and scrubbed by the writer —
-- the DB does not (cannot) scrub it.
--
-- `triggeredById` → users ON DELETE SET NULL, same as audit_log.userId: a user
-- hard-delete keeps the delivery history and drops only the attribution.
-- No index on it (table is retention-bounded; mirrors other nullable actor FKs).
--
-- Forward-only, fully additive: one enum, one table, three indexes, one FK,
-- two CHECK constraints (hand-added below — not expressible in the Prisma DSL).

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template" TEXT NOT NULL,
    "jobId" TEXT,
    "recipients" TEXT[],
    "subject" TEXT,
    "status" "EmailLogStatus" NOT NULL,
    "attempts" INTEGER NOT NULL,
    "errorName" TEXT,
    "errorMessage" TEXT,
    "providerMessageId" TEXT,
    "targetType" TEXT,
    "targetKey" TEXT,
    "triggeredById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_createdAt_idx" ON "email_logs"("createdAt");

-- CreateIndex
CREATE INDEX "email_logs_targetType_targetKey_idx" ON "email_logs"("targetType", "targetKey");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Hand-added CHECK constraints ──────────────────────────────────────────
-- A negative attempt count is always a writer bug.
ALTER TABLE "email_logs" ADD CONSTRAINT "email_log_attempts_non_negative"
  CHECK ("attempts" >= 0);

-- A 'sent' row without the acceptance time is meaningless for "when did it go out".
ALTER TABLE "email_logs" ADD CONSTRAINT "email_log_sent_has_sent_at"
  CHECK ("status" <> 'sent' OR "sentAt" IS NOT NULL);
