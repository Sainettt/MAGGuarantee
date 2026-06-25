import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { QUEUE_EMAIL_SEND } from '../jobs/queue-names';
import { EmailSendProcessor } from './email-send.processor';
import { MailJobsRegistry } from './mail-jobs.registry';
import { MailService } from './mail.service';
import { MailThreadingService } from './mail-threading.service';
import { MAIL_PROVIDER_TOKEN } from './providers/mail-provider.interface';
import { SmtpProvider } from './providers/smtp.provider';
import { GmailApiProvider } from './providers/gmail-api.provider';

/**
 * Phase 1 wiring: SMTP-only, MailService consumes it directly.
 * Phase 4.5 wiring: add `MailJobsRegistry` — Redis-backed job log so
 *   `/api/v1/diagnostics/mails` has rows to show. RedisService is globally
 *   provided via `RedisModule`.
 * Phase 9 (early): stand up the `email-send` BullMQ queue + in-process
 *   `EmailSendProcessor`. The 2FA login-code and password-reset emails route
 *   through it (`enqueue2faCode` / `enqueuePasswordReset`).
 * Phase 9 (full): provider is now selected by the `MAIL_PROVIDER` env var via
 *   `MAIL_PROVIDER_TOKEN` — `smtp` → Mailhog (dev/staging, default), `gmail`
 *   → `GmailApiProvider` (production, RFC threading). `MailService` depends on
 *   the token, never on a concrete class. `MailThreadingService` persists the
 *   thread ids and is a no-op under SMTP. See
 *   docs/16-jobs-and-integrations.md §"Email через Gmail API".
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_EMAIL_SEND })],
  providers: [
    MailService,
    MailThreadingService,
    // SmtpProvider stays Nest-managed (its OnModuleDestroy closes the SMTP
    // transporter on shutdown) and is the default impl behind the token.
    SmtpProvider,
    MailJobsRegistry,
    EmailSendProcessor,
    {
      provide: MAIL_PROVIDER_TOKEN,
      inject: [ConfigService, SmtpProvider],
      useFactory: (config: ConfigService<Env, true>, smtp: SmtpProvider) =>
        config.get('MAIL_PROVIDER', { infer: true }) === 'gmail'
          ? // Constructed only when selected, so blank GMAIL_* in dev/staging
            // never reaches this code path. The env superRefine guarantees the
            // three GMAIL_* secrets are present when MAIL_PROVIDER=gmail.
            new GmailApiProvider(config)
          : smtp,
    },
  ],
  exports: [MailService, MailJobsRegistry],
})
export class MailModule {}
