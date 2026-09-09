// Employee directory — MAGSpace integration behind the Google SSO (docs/24).
//
// Exports `DirectoryService` for `AuthModule` (the sign-in path) and
// `MagspaceClient` + `DirectoryState` for `DiagnosticsModule` (the health line).
// The reconcile cron lives here too, next to the logic it shares with login, so
// the two can never drift apart on what "no role" or "terminated" means.

import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { RefreshTokenModule } from '../auth/refresh-token.module';
import { UsersModule } from '../users/users.module';
import { DirectoryReconcileService } from './directory-reconcile.service';
import { DirectoryState } from './directory-state';
import { DirectoryService } from './directory.service';
import { MagspaceClient } from './magspace.client';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';
import { StanowiskoRoleMappingRepository } from './stanowisko-role-mapping.repository';

@Module({
  imports: [UsersModule, RefreshTokenModule, MailModule],
  controllers: [SsoController],
  providers: [
    MagspaceClient,
    StanowiskoRoleMappingRepository,
    DirectoryService,
    DirectoryState,
    DirectoryReconcileService,
    SsoService,
  ],
  exports: [DirectoryService, MagspaceClient, DirectoryState],
})
export class DirectoryModule {}
