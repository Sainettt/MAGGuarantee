import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { DriversModule } from '../drivers/drivers.module';
import { KmCalcModule } from '../km-calc/km-calc.module';
import { MailModule } from '../mail/mail.module';
import { TrailersModule } from '../trailers/trailers.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { ClaimsController } from './claims.controller';
import { ClaimsRepository } from './claims.repository';
import { ClaimsService } from './claims.service';
import { NrZglService } from './nr-zgl.service';

/**
 * Phase 3 — Claims module.
 *
 * Composes the per-feature ownership repositories (vehicle / driver /
 * trailer) so the service can validate ownership without re-implementing
 * the queries. KmCalcModule is imported for live preview + submit math.
 */
@Module({
  imports: [
    KmCalcModule,
    CarriersModule,
    VehiclesModule,
    DriversModule,
    TrailersModule,
    MailModule,
  ],
  controllers: [ClaimsController],
  providers: [ClaimsService, ClaimsRepository, NrZglService],
  exports: [ClaimsService, ClaimsRepository, NrZglService],
})
export class ClaimsModule {}
