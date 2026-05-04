import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

@Module({
  imports: [UsersModule],
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
