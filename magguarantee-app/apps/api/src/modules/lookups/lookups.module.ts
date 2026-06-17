import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { TeamsModule } from '../teams/teams.module';
import { UsersModule } from '../users/users.module';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

@Module({
  imports: [UsersModule, CarriersModule, TeamsModule],
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
