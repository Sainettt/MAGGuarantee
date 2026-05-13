// Phase 4 — Sub-slice 4.0 Foundation.
//
// Registers the in-transaction `AuditWriter` as a globally-injectable
// provider. Marked @Global so feature services (Phase 4.1+ — Claims, Carriers,
// Limits, Hard-delete) can pull it in without each module having to import
// AuditWriterModule explicitly.
//
// NB: there is also `apps/api/src/common/audit/AuditModule` with its own
// `AuditService` — that one is wired to the HTTP-pipeline interceptor for
// automatic post-response audit (fire-and-forget). The two are intentionally
// separate concerns:
//
//   - common/audit  → automatic post-response audit via `@Audit()` decorator
//                     (class name: `AuditService`)
//   - modules/audit → explicit in-`$transaction` audit, invoked by feature
//                     services that diff before/after or write atomically
//                     with the mutation
//                     (class name: `AuditWriter` — distinct on purpose to
//                     avoid grep-collisions with the Wave-2 service)
//
// Feature services in Phase 4 should inject `AuditWriter` directly.

import { Global, Module } from '@nestjs/common';

import { AuditWriter } from './audit.service';

@Global()
@Module({
  providers: [AuditWriter],
  exports: [AuditWriter],
})
export class AuditWriterModule {}
