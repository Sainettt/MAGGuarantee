import { Module } from '@nestjs/common';

import { MailService } from './mail.service';
import { SmtpProvider } from './providers/smtp.provider';

/**
 * Phase 1 wiring: SMTP-only, MailService consumes it directly.
 * Phase 9: introduce GmailApiProvider behind the same surface.
 */
@Module({
  providers: [MailService, SmtpProvider],
  exports: [MailService],
})
export class MailModule {}
