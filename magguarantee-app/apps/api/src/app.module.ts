import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AlertsModule } from './modules/alerts/alerts.module';
import { AuditModule } from './common/audit/audit.module';
import { AuditWriterModule } from './modules/audit/audit.module';
import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { CarriersModule } from './modules/carriers/carriers.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { DelegationsModule } from './modules/delegations/delegations.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { GpsModule } from './modules/integrations/gps/gps.module';
import { GuaranteeWatchdogModule } from './modules/guarantee-watchdog/guarantee-watchdog.module';
import { InspectionModule } from './modules/integrations/inspection/inspection.module';
import { ViesModule } from './modules/integrations/vies/vies.module';
import { WhiteListModule } from './modules/integrations/white-list/white-list.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { KmCalcModule } from './modules/km-calc/km-calc.module';
import { LimitsModule } from './modules/limits/limits.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { MailModule } from './modules/mail/mail.module';
import { OpiekunModule } from './modules/opiekun/opiekun.module';
import { PasswordModule } from './modules/password/password.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { TeamsModule } from './modules/teams/teams.module';
import { TrailerTypesModule } from './modules/trailer-types/trailer-types.module';
import { TrailersModule } from './modules/trailers/trailers.module';
import { UsersModule } from './modules/users/users.module';
import { VehicleRemovalAlertModule } from './modules/vehicle-removal-alert/vehicle-removal-alert.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { VerificationSlaModule } from './modules/verification-sla/verification-sla.module';
import { WeeklyReportModule } from './modules/weekly-report/weekly-report.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        // PII redaction per docs/16-jobs-and-integrations.md#логирование.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.body.password',
            'req.body.code',
            'req.body.sessionToken',
            '*.password',
            '*.passwordHash',
            '*.refreshToken',
            '*.accessToken',
            '*.code',
          ],
          censor: '***',
        },
        autoLogging: {
          ignore: (req) => req.url === '/health' || req.url === '/ready',
        },
      },
    }),
    // Default rate limit: 100 req/min/IP (overridable via @Throttle).
    // In NODE_ENV=test we crank the cap up so the e2e suite can issue the
    // many sequential login attempts the spec exercises without hitting 429.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: process.env.NODE_ENV === 'test' ? 1_000 : 100,
      },
    ]),
    // Scheduled jobs (docs/21 §5 — verification-SLA daily digest is the first).
    ScheduleModule.forRoot(),
    // BullMQ root (in-process workers). Global — must be imported before the
    // feature modules that `BullModule.registerQueue(...)` (Mail / Chat).
    // docs/16-jobs-and-integrations.md#структура-bullmq.
    JobsModule,
    PrismaModule,
    RedisModule,
    MailModule,
    AuditModule,
    AuditWriterModule,
    PasswordModule,
    UsersModule,
    // Google SSO — MAGSpace employee directory + the stanowisko → role admin
    // screen. Imported by AuthModule too; listed here so the feature is visible
    // in the app's module inventory alongside every other one.
    DirectoryModule,
    AuthModule,
    CarriersModule,
    VehiclesModule,
    DriversModule,
    TrailerTypesModule,
    TrailersModule,
    TeamsModule,
    LookupsModule,
    KmCalcModule,
    ClaimsModule,
    DelegationsModule,
    FleetModule,
    OpiekunModule,
    ViesModule,
    WhiteListModule,
    InspectionModule,
    GpsModule,
    // Phase 4.5 — admin ops surface (dashboard + audit read + diagnostics).
    LimitsModule,
    DiagnosticsModule,
    // docs/21 — pracownik verification-SLA daily-digest cron.
    VerificationSlaModule,
    // Guarantee Watchdog — wyjazd-reminder cron + compliance board (plan §5).
    GuaranteeWatchdogModule,
    // Phase 5.2 — document-expiry alerts (in-app, admin + opiekun).
    AlertsModule,
    // Vehicle-status rework Step B — 29-day «do usunięcia» admin-alert cron.
    VehicleRemovalAlertModule,
    // Phase 9 — Monday admin summary cron (GAS analog `sendWeeklyReport`).
    WeeklyReportModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global role gate. Runs AFTER JwtAuthGuard (so `req.user` is populated).
    // A no-op on routes without `@Roles(...)` (the guard returns true when no
    // metadata is present), so it only ADDS enforcement where a handler
    // declares `@Roles` but its controller forgot `@UseGuards(RolesGuard)` —
    // closing the "silent open endpoint" gap. Controllers may keep their own
    // `@UseGuards(RolesGuard)` (idempotent).
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
