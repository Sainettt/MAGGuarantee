import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { DriversController } from './drivers.controller';
import { DriversRepository } from './drivers.repository';
import { DriversService } from './drivers.service';

@Module({
  imports: [CarriersModule],
  controllers: [DriversController],
  providers: [DriversService, DriversRepository],
  exports: [DriversService, DriversRepository],
})
export class DriversModule {}
