import { Module } from '@nestjs/common';

import { ViesController } from './vies.controller';
import { ViesService } from './vies.service';

/**
 * VIES VAT lookup module.
 * Wired into AppModule per docs/13-api-design.md#external-integrations.
 */
@Module({
  controllers: [ViesController],
  providers: [ViesService],
  exports: [ViesService],
})
export class ViesModule {}
