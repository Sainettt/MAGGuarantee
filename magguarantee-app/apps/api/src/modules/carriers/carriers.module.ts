import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { PasswordModule } from '../password/password.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { CarrierAttachmentsController } from './carrier-attachments.controller';
import { CarrierAttachmentsRepository } from './carrier-attachments.repository';
import { CarrierAttachmentsService } from './carrier-attachments.service';
import { CarrierDocumentsRepository } from './carrier-documents.repository';
import { CarrierDocumentsService } from './carrier-documents.service';
import { CarriersController } from './carriers.controller';
import { CarriersRepository } from './carriers.repository';
import { CarriersService } from './carriers.service';

@Module({
  imports: [PasswordModule, UsersModule, StorageModule, MailModule],
  controllers: [CarriersController, CarrierAttachmentsController],
  providers: [
    CarriersService,
    CarriersRepository,
    CarrierAttachmentsService,
    CarrierAttachmentsRepository,
    CarrierDocumentsService,
    CarrierDocumentsRepository,
  ],
  exports: [
    CarriersService,
    CarriersRepository,
    // Exported so the readiness module can compose ADR-doc counts without
    // re-declaring the provider (it stays a single Prisma-backed instance).
    CarrierAttachmentsRepository,
  ],
})
export class CarriersModule {}
