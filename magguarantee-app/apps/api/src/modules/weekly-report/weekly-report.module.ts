import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { WeeklyReportRepository } from './weekly-report.repository';
import { WeeklyReportService } from './weekly-report.service';

/**
 * Monday weekly-report module (GAS analog `sendWeeklyReport`). Holds the
 * `@Cron` job + its repository. `ScheduleModule.forRoot()` is wired once at the
 * app root (see `app.module.ts`); this module only needs the job provider
 * registered for the scheduler to discover its `@Cron`.
 *
 * Imports `MailModule` for `MailService.enqueueWeeklyReport`.
 * `PrismaService` / `ConfigService` are globally provided.
 */
@Module({
  imports: [MailModule],
  providers: [WeeklyReportService, WeeklyReportRepository],
})
export class WeeklyReportModule {}
