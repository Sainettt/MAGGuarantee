import { Module } from '@nestjs/common';

import { CarrierReadinessModule } from '../carriers/carrier-readiness.module';
import { CarriersModule } from '../carriers/carriers.module';
import { DriversModule } from '../drivers/drivers.module';
import { TrailersModule } from '../trailers/trailers.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { DelegationsController } from './delegations.controller';
import { DelegationsRepository } from './delegations.repository';
import { DelegationsService } from './delegations.service';

@Module({
  imports: [
    CarriersModule,
    VehiclesModule,
    DriversModule,
    TrailersModule,
    CarrierReadinessModule,
  ],
  controllers: [DelegationsController],
  providers: [DelegationsService, DelegationsRepository],
  exports: [DelegationsService, DelegationsRepository],
})
export class DelegationsModule {}
