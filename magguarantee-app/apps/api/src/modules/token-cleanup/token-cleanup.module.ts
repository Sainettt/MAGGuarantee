import { Module } from '@nestjs/common';

import { RefreshTokenModule } from '../auth/refresh-token.module';
import { MailModule } from '../mail/mail.module';
import { TokenCleanupService } from './token-cleanup.service';

/**
 * Nightly `refresh_tokens` reaper + `email_logs` retention prune
 * (2026-08-14 logging audit, items 11 + 14). `ScheduleModule.forRoot()` is
 * wired at the app root; registering the provider is enough for `@Cron`.
 * `AuditWriter` (global AuditWriterModule), `OpsAlertService` (global
 * OpsAlertModule), `ConfigService` and `PrismaService` are global.
 */
@Module({
  imports: [RefreshTokenModule, MailModule],
  providers: [TokenCleanupService],
})
export class TokenCleanupModule {}
