import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { QUEUE_EMAIL_SEND } from '../jobs/queue-names';
import { EmailLogRepository } from './email-log.repository';
import { EmailSendProcessor } from './email-send.processor';
import { MailCompensationRegistry } from './mail-compensation.registry';
import { MailJobOutcomeRecorder } from './mail-job-outcome.recorder';
import { MailJobsRegistry } from './mail-jobs.registry';
import { MailSecretCipher } from './mail-secret-cipher';
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
 * Phase 9: the `email-send` BullMQ queue + in-process `EmailSendProcessor`
 *   carry every transactional email. Provider selected by `MAIL_PROVIDER` via
 *   `MAIL_PROVIDER_TOKEN` — `smtp` → Mailhog (dev/staging, default), `gmail`
 *   → `GmailApiProvider` (production, RFC threading). `MailThreadingService`
 *   persists the thread ids and is a no-op under SMTP. See
 *   docs/16-jobs-and-integrations.md §"Email через Gmail API".
 * 2026-08-14 logging audit (items 5 / 6 / 11 / 23):
 *   - `MailSecretCipher` seals codes / temporary passwords in job data;
 *   - `MailJobOutcomeRecorder` + `EmailLogRepository` write one `email_logs`
 *     row per final outcome and alert on permanent failures;
 *   - `MailCompensationRegistry` lets producers (watchdog, vehicle-removal
 *     alert) release "notified" stamps when their mail never went out.
 *   `EmailLogRepository` is exported for the retention prune in the
 *   token-cleanup cron; `OpsAlertService` comes from the global OpsAlertModule.
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
    MailSecretCipher,
    EmailLogRepository,
    MailCompensationRegistry,
    MailJobOutcomeRecorder,
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
  exports: [
    MailService,
    MailJobsRegistry,
    MailCompensationRegistry,
    EmailLogRepository,
  ],
})
export class MailModule {}
