import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { StorageModule } from '../storage/storage.module';
import { DriverAttachmentsRepository } from './driver-attachments.repository';
import { DriversController } from './drivers.controller';
import { DriversRepository } from './drivers.repository';
import { DriversService } from './drivers.service';

@Module({
  imports: [CarriersModule, StorageModule],
  controllers: [DriversController],
  providers: [DriversService, DriversRepository, DriverAttachmentsRepository],
  exports: [DriversService, DriversRepository],
})
export class DriversModule {}
