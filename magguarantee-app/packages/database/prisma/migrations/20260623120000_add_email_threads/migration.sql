-- Phase 9 (Gmail API) — persistent store for RFC email threading.
--
-- One row per email conversation, keyed by a business `threadKey`
-- (e.g. 'wniosek-GWA/001/05/26'). On the first send `gmailThreadId` and
-- `lastMessageId` are NULL; after the Gmail API returns ids we persist them so
-- subsequent sends thread correctly (gmailThreadId → gmail.users.messages.send,
-- lastMessageId → In-Reply-To / References headers). The SMTP/Mailhog provider
-- ignores these columns entirely, so dev/staging behaviour is unchanged.
-- See docs/16-jobs-and-integrations.md §"Хранение thread-id".

-- CreateTable
CREATE TABLE "email_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "threadKey" TEXT NOT NULL,
    "gmailThreadId" TEXT,
    "lastMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_threadKey_key" ON "email_threads"("threadKey");
