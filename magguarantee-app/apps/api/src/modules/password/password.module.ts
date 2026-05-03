import { Module } from '@nestjs/common';

import { PasswordService } from '../auth/password.service';

/**
 * Stand-alone module exposing `PasswordService` so non-auth callers (Wave 3:
 * UsersService, CarriersService, DriversService) can hash passwords without
 * pulling in the full AuthModule.
 *
 * AuthModule is unaffected — it still provides `PasswordService` itself, and
 * NestJS deduplicates the provider via DI tokens. Only one instance exists at
 * runtime.
 */
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class PasswordModule {}
