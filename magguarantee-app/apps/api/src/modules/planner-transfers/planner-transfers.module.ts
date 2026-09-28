import { Module } from '@nestjs/common';

import { DelegationsModule } from '../delegations/delegations.module';
import { UsersModule } from '../users/users.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { PlannerTransfersController } from './planner-transfers.controller';
import { PlannerTransfersService } from './planner-transfers.service';

/**
 * docs/29 — vehicle planner transfer (request → approval) and the planista
 * history. The two tables' repositories live in `VehiclesModule` (vehicle
 * data; `VehiclesService` cancels a pending request on deactivation); this
 * module owns the workflow and its REST surface.
 */
@Module({
  imports: [
    // VehiclesRepository (lock + set planner), the transfer / journal repos.
    VehiclesModule,
    // UsersRepository — target + current-planista lookups.
    UsersModule,
    // DelegationsRepository — the R6 move of not-yet-departed trips.
    DelegationsModule,
  ],
  controllers: [PlannerTransfersController],
  providers: [PlannerTransfersService],
})
export class PlannerTransfersModule {}
