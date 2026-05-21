import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { VehicleAttachmentsRepository } from './vehicle-attachments.repository';
import { VehiclesController } from './vehicles.controller';
import { VehiclesRepository } from './vehicles.repository';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [UsersModule, CarriersModule, StorageModule],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    VehiclesRepository,
    VehicleAttachmentsRepository,
  ],
  exports: [VehiclesService, VehiclesRepository],
})
export class VehiclesModule {}
