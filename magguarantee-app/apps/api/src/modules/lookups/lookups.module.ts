import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

@Module({
  // VehiclesModule — the transfer-target picker reads the vehicle's current
  // planista (docs/29).
  imports: [UsersModule, CarriersModule, TeamsModule, VehiclesModule],
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
