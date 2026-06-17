import { Module } from '@nestjs/common';

import { TeamsController } from './teams.controller';
import { TeamsRepository } from './teams.repository';
import { TeamsService } from './teams.service';

/**
 * Phase 11 — dispatch-team admin CRUD + the `/lookups/teams` data source
 * (`TeamsService.lookup`, consumed by `LookupsModule`). Exports the service so
 * the lookups controller can reuse it without a second repository.
 */
@Module({
  controllers: [TeamsController],
  providers: [TeamsService, TeamsRepository],
  exports: [TeamsService, TeamsRepository],
})
export class TeamsModule {}
