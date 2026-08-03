import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AlertsController } from './alerts.controller';
import { AlertsRepository } from './alerts.repository';
import { AlertsService } from './alerts.service';

/**
 * Phase 5.2 — document-expiry alerts. Backs `GET /api/v1/alerts`. Reads the
 * carriers / vehicles / drivers tables directly via a focused
 * `AlertsRepository`; no writes, no cron (computed live per request).
 */
@Module({
  imports: [PrismaModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsRepository],
  exports: [AlertsService],
})
export class AlertsModule {}
