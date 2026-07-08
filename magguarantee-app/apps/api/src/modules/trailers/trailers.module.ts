import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { StorageModule } from '../storage/storage.module';
import { TrailerTypesModule } from '../trailer-types/trailer-types.module';
import { TrailerAttachmentsRepository } from './trailer-attachments.repository';
import { TrailersController } from './trailers.controller';
import { TrailersRepository } from './trailers.repository';
import { TrailersService } from './trailers.service';

@Module({
  imports: [CarriersModule, TrailerTypesModule, StorageModule],
  controllers: [TrailersController],
  providers: [TrailersService, TrailersRepository, TrailerAttachmentsRepository],
  exports: [TrailersService, TrailersRepository],
})
export class TrailersModule {}
