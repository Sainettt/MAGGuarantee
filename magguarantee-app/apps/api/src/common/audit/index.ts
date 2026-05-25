// Public surface of the audit module.
//
// Pre-Phase-4.4: the legacy fire-and-forget `AuditService` was removed.
// The unified write path is `AuditWriter` from `modules/audit`, invoked by
// the `AuditInterceptor` under an `AuditContext` opened around
// `prisma.$transaction`. Feature code that imported `AuditService` should
// migrate to `AuditWriter`, or rely on the decorator-driven interceptor
// for the standard `@Audit(...)`-tagged path.

export { Audit, type AuditConfig, type AuditableRequest } from './audit.decorator';
export { AuditModule } from './audit.module';
export { AuditContext, type AuditContextStore } from './audit-context';
export { AUDIT_METADATA_KEY, AUDIT_REDACTED } from './audit.constants';
export { scrubForAudit } from './audit.scrub';
