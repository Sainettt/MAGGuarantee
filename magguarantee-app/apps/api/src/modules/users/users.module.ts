import { Module } from '@nestjs/common';

import { PasswordModule } from '../password/password.module';
import { RefreshTokenModule } from '../auth/refresh-token.module';
import { MailModule } from '../mail/mail.module';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [PasswordModule, RefreshTokenModule, MailModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
