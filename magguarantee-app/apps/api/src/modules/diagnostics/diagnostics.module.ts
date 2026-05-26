import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsRepository } from './diagnostics.repository';
import { DiagnosticsService } from './diagnostics.service';

/**
 * Phase 4.5 — Diagnostics module.
 *
 * Imports `MailModule` for `MailJobsRegistry` + `MailService` (resend
 * pipeline). `RedisService` and `PrismaService` are globally provided.
 */
@Module({
  imports: [MailModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService, DiagnosticsRepository],
})
export class DiagnosticsModule {}
