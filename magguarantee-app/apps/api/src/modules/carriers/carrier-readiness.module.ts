import { Module } from '@nestjs/common';

import { VehiclesModule } from '../vehicles/vehicles.module';
import { CarrierReadinessService } from './carrier-readiness.service';
import { CarriersModule } from './carriers.module';

/**
 * Dedicated module for the shared carrier-readiness computation.
 *
 * Kept separate from `CarriersModule` to avoid a circular import: the
 * readiness service needs `VehiclesRepository` (from `VehiclesModule`), and
 * `VehiclesModule` already imports `CarriersModule`. Living in its own module
 * that imports BOTH `CarriersModule` (for `CarriersRepository` +
 * `CarrierAttachmentsRepository`) and `VehiclesModule` keeps the dependency
 * graph acyclic — nothing imports this module back.
 *
 * Consumers (DelegationsModule, FleetModule) import this module to inject
 * `CarrierReadinessService`.
 */
@Module({
  imports: [CarriersModule, VehiclesModule],
  providers: [CarrierReadinessService],
  exports: [CarrierReadinessService],
})
export class CarrierReadinessModule {}
