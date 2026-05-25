import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { UsersModule } from '../users/users.module';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

@Module({
  imports: [UsersModule, CarriersModule],
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
