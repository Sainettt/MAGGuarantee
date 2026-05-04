import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

/**
 * Wires the `AuditInterceptor` globally and provides `AuditService` for any
 * future caller that needs to write rows directly (e.g. background jobs
 * outside the HTTP request pipeline).
 *
 * Marked @Global so feature modules can inject `AuditService` without a
 * dedicated import.
 */
@Global()
@Module({
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
