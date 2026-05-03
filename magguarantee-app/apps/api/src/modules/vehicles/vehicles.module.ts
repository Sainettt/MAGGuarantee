import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { UsersModule } from '../users/users.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesRepository } from './vehicles.repository';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [UsersModule, CarriersModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehiclesRepository],
  exports: [VehiclesService, VehiclesRepository],
})
export class VehiclesModule {}
