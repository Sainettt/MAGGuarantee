import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ReadinessController } from './readiness.controller';

/**
 * Liveness (`/health`) + readiness (`/ready`) probes. Both are outside the
 * global `/api/v1` prefix (see `main.ts`) and `@Public()`.
 *
 * No `imports`: `PrismaModule` and `RedisModule` are `@Global()`, so the
 * readiness controller can inject their services directly.
 */
@Module({
  controllers: [HealthController, ReadinessController],
})
export class HealthModule {}
