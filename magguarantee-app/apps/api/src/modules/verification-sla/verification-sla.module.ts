import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { VerificationSlaRepository } from './verification-sla.repository';
import { VerificationSlaService } from './verification-sla.service';

/**
 * Verification-SLA daily-digest module (docs/21-pracownik-verification-sla.md
 * §5). Holds the `@Cron` job + its repository. `ScheduleModule.forRoot()` is
 * wired once at the app root (see `app.module.ts`); this module only needs the
 * job provider to be registered for the scheduler to discover its `@Cron`.
 *
 * Imports `MailModule` for `MailService.sendVerificationDigest`.
 * `PrismaService` / `ConfigService` are globally provided.
 */
@Module({
  imports: [MailModule],
  providers: [VerificationSlaService, VerificationSlaRepository],
})
export class VerificationSlaModule {}
