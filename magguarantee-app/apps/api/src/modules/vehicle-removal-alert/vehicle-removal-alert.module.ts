import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { VehicleRemovalAlertRepository } from './vehicle-removal-alert.repository';
import { VehicleRemovalAlertService } from './vehicle-removal-alert.service';

/**
 * Vehicle-removal alert module (vehicle-status rework, Step B — Part 3). Holds
 * the daily 07:20 `@Cron` that emails all active admins the list of LIVE
 * vehicles idle ≥29 calendar days (`do_usuniecia`). NO controller — read-only
 * cron surface. `ScheduleModule.forRoot()` is wired once at the app root;
 * registering the service provider is enough for the scheduler to discover its
 * `@Cron`.
 *
 * Imports:
 *  - `MailModule` — the `vehicle-removal-admin` template + send/enqueue.
 *  - `UsersModule` — `UsersRepository.listByRole('admin')` (recipient set).
 *  - `VehiclesModule` — `VehicleDelegationStatusRepository` (batched
 *    delegation-status, no N+1), which VehiclesModule already exports.
 *    One-way import (VehiclesModule does NOT depend on this module) → no cycle.
 * `PrismaService` / `ConfigService` are globally provided.
 */
@Module({
  imports: [MailModule, UsersModule, VehiclesModule],
  providers: [VehicleRemovalAlertService, VehicleRemovalAlertRepository],
})
export class VehicleRemovalAlertModule {}
