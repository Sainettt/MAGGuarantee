import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { GuaranteeWatchdogModule } from '../guarantee-watchdog/guarantee-watchdog.module';
import { StorageModule } from '../storage/storage.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { VehicleAttachmentsRepository } from './vehicle-attachments.repository';
import { VehicleDailyKmRepository } from './vehicle-daily-km.repository';
import { VehicleDailyKmService } from './vehicle-daily-km.service';
import { VehicleDelegationStatusRepository } from './vehicle-delegation-status.repository';
import { VehiclePlannerAssignmentsRepository } from './vehicle-planner-assignments.repository';
import { VehiclePlannerTransfersRepository } from './vehicle-planner-transfers.repository';
import { VehiclesController } from './vehicles.controller';
import { VehiclesRepository } from './vehicles.repository';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [
    UsersModule,
    CarriersModule,
    StorageModule,
    TeamsModule,
    // Guarantee Watchdog — agreement-toggle hook: on true→false the vehicles
    // service resolves the open idle episode (agreement_off).
    GuaranteeWatchdogModule,
  ],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    VehiclesRepository,
    VehicleAttachmentsRepository,
    VehicleDailyKmService,
    VehicleDailyKmRepository,
    VehicleDelegationStatusRepository,
    // docs/29 — the planista journal + transfer requests. Owned here (they are
    // vehicle data, and `VehiclesService` cancels a pending request on
    // deactivation); the workflow lives in `PlannerTransfersModule`.
    VehiclePlannerTransfersRepository,
    VehiclePlannerAssignmentsRepository,
  ],
  exports: [
    VehiclesService,
    VehiclesRepository,
    VehicleDailyKmRepository,
    VehicleDelegationStatusRepository,
    VehiclePlannerTransfersRepository,
    VehiclePlannerAssignmentsRepository,
  ],
})
export class VehiclesModule {}
