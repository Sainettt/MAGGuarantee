import { Module } from '@nestjs/common';

import { InspectionController } from './inspection.controller';
import { InspectionService } from './inspection.service';

/**
 * info-car.pl link-builder module.
 * Wired into AppModule per docs/13-api-design.md#external-integrations.
 */
@Module({
  controllers: [InspectionController],
  providers: [InspectionService],
  exports: [InspectionService],
})
export class InspectionModule {}
