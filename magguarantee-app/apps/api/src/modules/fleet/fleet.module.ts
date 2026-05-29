import { Module } from '@nestjs/common';

import { CarrierReadinessModule } from '../carriers/carrier-readiness.module';
import { CarriersModule } from '../carriers/carriers.module';
import { DriversModule } from '../drivers/drivers.module';
import { TrailersModule } from '../trailers/trailers.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

@Module({
  imports: [
    CarriersModule,
    VehiclesModule,
    DriversModule,
    TrailersModule,
    CarrierReadinessModule,
  ],
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
