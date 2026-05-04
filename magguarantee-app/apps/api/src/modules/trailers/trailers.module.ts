import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { TrailerTypesModule } from '../trailer-types/trailer-types.module';
import { TrailersController } from './trailers.controller';
import { TrailersRepository } from './trailers.repository';
import { TrailersService } from './trailers.service';

@Module({
  imports: [CarriersModule, TrailerTypesModule],
  controllers: [TrailersController],
  providers: [TrailersService, TrailersRepository],
  exports: [TrailersService, TrailersRepository],
})
export class TrailersModule {}
