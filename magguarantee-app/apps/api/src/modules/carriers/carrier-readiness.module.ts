import { Module } from '@nestjs/common';

import { CarrierReadinessService } from './carrier-readiness.service';
import { CarriersModule } from './carriers.module';

/**
 * Dedicated module for the shared carrier-readiness computation.
 *
 * Kept separate from `CarriersModule` so consumers (DelegationsModule,
 * FleetModule) can import just the readiness service without pulling the whole
 * carriers surface. Readiness now derives ONLY from the carrier's active fleet
 * counts (`CarriersRepository` `_count`), so this module needs just
 * `CarriersModule` — the ADR-vehicle / ADR-doc queries (and the
 * `VehiclesModule` import they required) were removed with the carrier-level
 * ADR concept (2026-07).
 */
@Module({
  imports: [CarriersModule],
  providers: [CarrierReadinessService],
  exports: [CarrierReadinessService],
})
export class CarrierReadinessModule {}
