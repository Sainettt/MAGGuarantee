import { Module } from '@nestjs/common';

import { TrailerTypesController } from './trailer-types.controller';
import { TrailerTypesRepository } from './trailer-types.repository';
import { TrailerTypesService } from './trailer-types.service';

@Module({
  controllers: [TrailerTypesController],
  providers: [TrailerTypesService, TrailerTypesRepository],
  exports: [TrailerTypesService, TrailerTypesRepository],
})
export class TrailerTypesModule {}
