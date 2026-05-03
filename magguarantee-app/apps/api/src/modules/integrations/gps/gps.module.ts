import { Module } from '@nestjs/common';

import { GpsController } from './gps.controller';
import { GpsProviderFactory } from './gps.config';
import { GpsRepository } from './gps.repository';
import { GpsService } from './gps.service';
import { GpsMockProvider } from './providers/gps-mock.provider';
import { GpsVendorProvider } from './providers/gps-vendor.provider';

/**
 * GPS tracker module — Phase 2 skeleton.
 *
 * Per docs/16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api.
 *
 * Wiring:
 *  - Both provider classes are exposed to DI so the factory can pick.
 *  - `GpsProviderFactory` returns the chosen provider via `GPS_PROVIDER_TOKEN`.
 *  - `GpsService` consumes via `@Inject(GPS_PROVIDER_TOKEN)`.
 *
 * BullMQ scheduler is NOT yet wired (see ./gps.scheduler.ts). When Phase 9
 * adds bullmq + @nestjs/bullmq, register the scheduler + processor here.
 */
@Module({
  controllers: [GpsController],
  providers: [
    GpsService,
    GpsRepository,
    GpsMockProvider,
    GpsVendorProvider,
    GpsProviderFactory,
  ],
  exports: [GpsService],
})
export class GpsModule {}
