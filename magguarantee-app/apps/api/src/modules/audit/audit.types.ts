// Phase 4 — Sub-slice 4.0 Foundation.
//
// Contract types for the in-transaction audit service. Per
// docs/04-data-model.md#auditlog-аудит and docs/12-database-schema.md:475-494
// the `AuditLog` row carries an `action` verb, optional target descriptors,
// optional `before` / `after` JSON snapshots, an optional `reason` (required
// for hard-delete flows), free-form `metadata`, plus the actor identity
// captured at the moment of the write.
//
// This service complements the Wave-2 HTTP-pipeline interceptor in
// `apps/api/src/common/audit/` — the interceptor fires after the response is
// materialised and CANNOT participate in a service-side `prisma.$transaction`.
// Phase 4 mutating flows (claim verification, hard-delete, limits change)
// need the audit row to commit atomically with the mutation; this module
// provides that path via `AuditService.log({ ..., tx })`.

import type { Prisma } from '@magguarantee/database';
import type { Role } from '@magguarantee/shared';

/**
 * Identity of the actor that triggered an audit-worthy action.
 *
 *  - An object literal `{ userId, userRole, ipAddress? }` describes a human
 *    user acting through an HTTP request.
 *  - The string literal `'system'` describes an action performed by the
 *    server itself — cron jobs, BullMQ workers, startup migrations. In that
 *    case the `action` MUST be prefixed with `system.` so audit consumers
 *    can distinguish operator-driven changes from background activity.
 */
export type AuditActor =
  | {
      userId: string;
      userRole: Role;
      ipAddress?: string;
    }
  | 'system';

/**
 * Input shape for `AuditService.log()`.
 *
 * Convention notes:
 *  - `action` follows verb-noun camelCase (`updateClaim`, `hardDeleteCarrier`,
 *    `setLimits`, `system.cleanupExpiredTokens`). NOT dotted "claim.updated"
 *    notation — that's an event-bus convention, not the audit-log one.
 *  - `before` / `after` are sanitised by `JSON.parse(JSON.stringify(...))`
 *    before being persisted (removes `undefined`, `Function`, etc.). Callers
 *    are responsible for redacting secrets BEFORE handing them to this
 *    service.
 *  - `metadata` is persisted as-is. Use it for structured context that
 *    doesn't fit the formal columns (e.g. `{ reasonCategory: 'gdpr' }`).
 *  - `tx` lets a caller running inside `prisma.$transaction(async tx => …)`
 *    write the audit row on the same transaction client. Without it, the
 *    write goes through the injected `PrismaService` (a separate connection
 *    from any ambient transaction).
 */
export interface AuditEntryInput {
  /** Verb-noun camelCase. `system.` prefix mandatory when `actor === 'system'`. */
  action: string;

  /** Domain entity (e.g. `'Claim'`, `'Carrier'`, `'Vehicle'`). */
  targetType?: string;

  /** Stable human identifier — `nrZgl`, login, plate, UUID. */
  targetKey?: string;

  /** Snapshot before the mutation. JSON-serialised. */
  before?: unknown;

  /** Snapshot after the mutation. JSON-serialised. */
  after?: unknown;

  /**
   * Free-text reason. Required by docs/04-data-model.md for hard-delete and
   * for any operator-driven status reversion; the service does NOT enforce
   * that — feature services do, then pass it through here.
   */
  reason?: string;

  /** Arbitrary structured metadata, persisted verbatim. */
  metadata?: Record<string, unknown>;

  /** Who acted. See `AuditActor` for the two shapes. */
  actor: AuditActor;

  /**
   * Optional Prisma transaction client. When provided, the audit row is
   * created on the same transaction as the caller's mutation — if the
   * transaction rolls back the audit row goes with it. Without it the
   * write happens on a fresh connection from `PrismaService`.
   */
  tx?: Prisma.TransactionClient;
}
