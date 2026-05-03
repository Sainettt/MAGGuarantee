import { Module } from '@nestjs/common';

import { PasswordModule } from '../password/password.module';
import { UsersModule } from '../users/users.module';
import { CarriersController } from './carriers.controller';
import { CarriersRepository } from './carriers.repository';
import { CarriersService } from './carriers.service';

@Module({
  imports: [PasswordModule, UsersModule],
  controllers: [CarriersController],
  providers: [CarriersService, CarriersRepository],
  exports: [CarriersService, CarriersRepository],
})
export class CarriersModule {}
