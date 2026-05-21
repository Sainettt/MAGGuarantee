import { Module } from '@nestjs/common';

import { StorageService } from './storage.service';

/**
 * S3-compatible object storage module (MinIO in dev). Provides the generic
 * `StorageService` to any feature module that needs to persist file bytes —
 * currently `VehiclesModule` (umowa / cabotage attachments), with a future
 * claims auth-screenshot consumer.
 */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
