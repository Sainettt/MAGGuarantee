import { Module } from '@nestjs/common';

import { LimitsController } from './limits.controller';
import { LimitsRepository } from './limits.repository';
import { LimitsService } from './limits.service';

/**
 * Phase 4.5 — Monthly limits admin module.
 *
 * Self-contained: only depends on `PrismaService` (provided globally via
 * `PrismaModule`) and the global `AuditWriter` (wired through the
 * `AuditInterceptor`). No cross-module imports needed.
 */
@Module({
  controllers: [LimitsController],
  providers: [LimitsService, LimitsRepository],
  exports: [LimitsService, LimitsRepository],
})
export class LimitsModule {}
