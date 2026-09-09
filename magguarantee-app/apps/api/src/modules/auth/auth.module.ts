import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { DirectoryModule } from '../directory/directory.module';
import { MailModule } from '../mail/mail.module';
import { PasswordModule } from '../password/password.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleIdTokenService } from './google/google-id-token.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenModule } from './refresh-token.module';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [
    PassportModule,
    // We sign with explicit per-call secrets/expiresIn so global registration
    // is just a placeholder. Required by @nestjs/jwt to provide JwtService.
    JwtModule.register({}),
    PasswordModule,
    RefreshTokenModule,
    UsersModule,
    MailModule,
    // Google SSO — the employee directory behind `POST /auth/google`.
    DirectoryModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleIdTokenService,
    TwoFactorService,
    PasswordResetService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
