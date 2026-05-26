import { Module } from '@nestjs/common';

import { MailJobsRegistry } from './mail-jobs.registry';
import { MailService } from './mail.service';
import { SmtpProvider } from './providers/smtp.provider';

/**
 * Phase 1 wiring: SMTP-only, MailService consumes it directly.
 * Phase 4.5 wiring: add `MailJobsRegistry` — Redis-backed job log so
 *   `/api/v1/diagnostics/mails` has rows to show. RedisService is globally
 *   provided via `RedisModule`.
 * Phase 9: introduce GmailApiProvider behind the same surface.
 */
@Module({
  providers: [MailService, SmtpProvider, MailJobsRegistry],
  exports: [MailService, MailJobsRegistry],
})
export class MailModule {}
