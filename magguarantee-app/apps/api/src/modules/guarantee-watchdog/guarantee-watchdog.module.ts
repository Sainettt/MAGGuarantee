import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { GuaranteeWatchdogController } from './guarantee-watchdog.controller';
import { GuaranteeWatchdogRepository } from './guarantee-watchdog.repository';
import { GuaranteeWatchdogService } from './guarantee-watchdog.service';

/**
 * Guarantee Watchdog module (plan §5). Holds the daily `@Cron`, the read
 * endpoints, and the episode journal. `ScheduleModule.forRoot()` is wired once
 * at the app root; registering the service provider is enough for the scheduler
 * to discover its `@Cron`.
 *
 * STATEFUL (unlike verification-sla): dedups reminder emails + durable-fixes
 * violations in `GuaranteeIdleEpisode`.
 *
 * Exports `GuaranteeWatchdogService` so the delegations (resolve-hook on
 * `add()`) and vehicles (agreement-toggle hook) modules can call the off-path
 * hooks without importing the repository. Both hooks are best-effort and never
 * throw outward. Imports `MailModule` for the two watchdog templates;
 * `PrismaService` / `ConfigService` are globally provided.
 */
@Module({
  imports: [MailModule],
  controllers: [GuaranteeWatchdogController],
  providers: [GuaranteeWatchdogService, GuaranteeWatchdogRepository],
  exports: [GuaranteeWatchdogService],
})
export class GuaranteeWatchdogModule {}
