import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { MailModule } from './modules/mail/mail.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { UsersModule } from './modules/users/users.module';

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
    PrismaModule,
    RedisModule,
    MailModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
