import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE_EMAIL_SEND } from '../jobs/queue-names';
import { EmailSendProcessor } from './email-send.processor';
import { MailJobsRegistry } from './mail-jobs.registry';
import { MailService } from './mail.service';
import { SmtpProvider } from './providers/smtp.provider';

/**
 * Phase 1 wiring: SMTP-only, MailService consumes it directly.
 * Phase 4.5 wiring: add `MailJobsRegistry` — Redis-backed job log so
 *   `/api/v1/diagnostics/mails` has rows to show. RedisService is globally
 *   provided via `RedisModule`.
 * Phase 9 (early): stand up the `email-send` BullMQ queue + in-process
 *   `EmailSendProcessor`. ONLY the 2FA login-code email is routed through it
 *   (`MailService.enqueue2faCode`); every other mail call-site stays
 *   synchronous until the full Phase 9 migration. `BullModule.forRoot` lives
 *   in the global `JobsModule`; here we `registerQueue` to obtain the named
 *   queue (for the producer in `MailService`) and bind the worker.
 * Phase 9 (full): introduce GmailApiProvider behind the same surface and route
 *   the remaining mail types through the queue.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_EMAIL_SEND })],
  providers: [MailService, SmtpProvider, MailJobsRegistry, EmailSendProcessor],
  exports: [MailService, MailJobsRegistry],
})
export class MailModule {}
