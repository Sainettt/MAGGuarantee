import { Module } from '@nestjs/common';

import { CarrierReadinessModule } from '../carriers/carrier-readiness.module';
import { CarriersModule } from '../carriers/carriers.module';
import { DriversModule } from '../drivers/drivers.module';
import { ChatModule } from '../integrations/chat/chat.module';
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
    // Phase 9 (early) — outbound Google Chat wyjazd notification fired from
    // `DelegationsService.add` after the delegation is created.
    ChatModule,
  ],
  controllers: [DelegationsController],
  providers: [DelegationsService, DelegationsRepository],
  exports: [DelegationsService, DelegationsRepository],
})
export class DelegationsModule {}
