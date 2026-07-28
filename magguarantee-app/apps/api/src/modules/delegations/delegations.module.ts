import { forwardRef, Module } from '@nestjs/common';

import { CarrierReadinessModule } from '../carriers/carrier-readiness.module';
import { CarriersModule } from '../carriers/carriers.module';
import { ClaimsModule } from '../claims/claims.module';
import { DriversModule } from '../drivers/drivers.module';
import { GuaranteeWatchdogModule } from '../guarantee-watchdog/guarantee-watchdog.module';
import { MailModule } from '../mail/mail.module';
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
    // Phase 9 follow-up — outbound email on new wyjazd / vehicle ready.
    MailModule,
    // Guarantee Watchdog — resolve-hook on `add()` closes the vehicle's open
    // idle episode instantly (banner clears without waiting for the cron).
    GuaranteeWatchdogModule,
    // Phase 7 REWORK (2026-06-20 #4) — the `returned()` transition calls the
    // claims auto-recalc (`ClaimsService.recalcFromDelegation`). ClaimsModule
    // imports DelegationsModule back (for `DelegationsRepository` on submit), so
    // the cycle is broken with `forwardRef` on both sides.
    forwardRef(() => ClaimsModule),
  ],
  controllers: [DelegationsController],
  providers: [DelegationsService, DelegationsRepository],
  exports: [DelegationsService, DelegationsRepository],
})
export class DelegationsModule {}
