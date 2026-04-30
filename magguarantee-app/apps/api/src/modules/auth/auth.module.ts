import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { PasswordService } from './password.service';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [
    PassportModule,
    // We sign with explicit per-call secrets/expiresIn so global registration
    // is just a placeholder. Required by @nestjs/jwt to provide JwtService.
    JwtModule.register({}),
    UsersModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TwoFactorService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
