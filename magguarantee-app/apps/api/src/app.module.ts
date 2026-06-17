import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AuditModule } from './common/audit/audit.module';
import { AuditWriterModule } from './modules/audit/audit.module';
import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { CarriersModule } from './modules/carriers/carriers.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { DelegationsModule } from './modules/delegations/delegations.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { GpsModule } from './modules/integrations/gps/gps.module';
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
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { VerificationSlaModule } from './modules/verification-sla/verification-sla.module';

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
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
