import { Module } from '@nestjs/common';

import { DirectoryModule } from '../directory/directory.module';
import { MailModule } from '../mail/mail.module';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsRepository } from './diagnostics.repository';
import { DiagnosticsService } from './diagnostics.service';

/**
 * Phase 4.5 — Diagnostics module.
 *
 * Imports `MailModule` for `MailJobsRegistry` + `MailService` (resend
 * pipeline) and `DirectoryModule` for the MAGSpace health line (docs/24 §A4).
 * `RedisService` and `PrismaService` are globally provided.
 */
@Module({
  imports: [MailModule, DirectoryModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService, DiagnosticsRepository],
})
export class DiagnosticsModule {}
