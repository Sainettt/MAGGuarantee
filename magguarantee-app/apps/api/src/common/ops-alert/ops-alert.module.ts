import { Global, Module } from '@nestjs/common';

import { OpsAlertService } from './ops-alert.service';

/**
 * Global so crons, BullMQ processors and the Redis wrapper can inject
 * `OpsAlertService` without each feature module importing this one.
 * `ConfigService` is global via `ConfigModule.forRoot({ isGlobal: true })`.
 */
@Global()
@Module({
  providers: [OpsAlertService],
  exports: [OpsAlertService],
})
export class OpsAlertModule {}
