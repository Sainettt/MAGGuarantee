import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditWriterModule } from '../../modules/audit/audit.module';
import { PrismaModule } from '../../modules/prisma/prisma.module';
import { AuditInterceptor } from './audit.interceptor';

/**
 * Wires the `AuditInterceptor` globally. Pre-Phase-4.4: the interceptor
 * uses the unified `AuditWriter` (from `modules/audit`) inside a Prisma
 * transaction, guaranteeing atomic mutation + audit-row writes for any
 * `@Audit()`-tagged endpoint.
 *
 * The old `AuditService` was deleted as part of the same refactor — there is
 * now exactly one path for audit writes, and feature services don't need to
 * thread a `tx` parameter manually (the interceptor opens an `AuditContext`
 * via `AsyncLocalStorage`; `PrismaService.tx` and `AuditWriter.log()` both
 * pick it up automatically).
 */
@Global()
@Module({
  imports: [PrismaModule, AuditWriterModule],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AuditModule {}
