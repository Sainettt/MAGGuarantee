import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { GuaranteeWatchdogModule } from '../guarantee-watchdog/guarantee-watchdog.module';
import { StorageModule } from '../storage/storage.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { VehicleAttachmentsRepository } from './vehicle-attachments.repository';
import { VehicleDailyKmRepository } from './vehicle-daily-km.repository';
import { VehicleDailyKmService } from './vehicle-daily-km.service';
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
  ],
  exports: [VehiclesService, VehiclesRepository, VehicleDailyKmRepository],
})
export class VehiclesModule {}
