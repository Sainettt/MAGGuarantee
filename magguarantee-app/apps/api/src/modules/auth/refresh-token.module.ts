import { Module } from '@nestjs/common';

import { RefreshTokenRepository } from './refresh-token.repository';

/**
 * Stand-alone module exposing `RefreshTokenRepository` so both AuthModule
 * (rotation / reuse-detection) and UsersModule (admin reset-password must
 * revoke the target user's sessions) can share one repository without a
 * circular module import.
 *
 * Mirrors the `PasswordModule` pattern. PrismaService is globally provided
 * via `PrismaModule`, so this module only declares the repository.
 */
@Module({
  providers: [RefreshTokenRepository],
  exports: [RefreshTokenRepository],
})
export class RefreshTokenModule {}
