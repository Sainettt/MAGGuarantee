// Phase 4 — Sub-slice 4.0 Foundation.
//
// Same-transaction audit write path. Pairs with the Wave-2
// `AuditInterceptor` in `apps/api/src/common/audit/`: the interceptor
// covers fire-and-forget HTTP-pipeline writes, this service covers
// in-`$transaction` writes that must commit (or roll back) with the
// caller's mutation.
//
// See `audit.types.ts` for the public contract.

import { Injectable } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';
import type {
  AuditActor,
  AuditEntryInput,
} from './audit.types';

/**
 * Prisma delegate surface we need. Both the extended PrismaService client and
 * a `Prisma.TransactionClient` expose `.auditLog.create(...)` with the same
 * shape, so we type the writer through this narrow interface and avoid the
 * deep generic noise of the extended-client type.
 */
type PrismaAuditDelegate = {
  auditLog: {
    create: (args: {
      data: Prisma.AuditLogUncheckedCreateInput;
    }) => Promise<unknown>;
  };
};

@Injectable()
export class AuditWriter {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists a single row to `audit_log`.
   *
   * Failure mode (intentional): if the underlying insert throws — DB
   * unreachable, FK violation, JSON too large — the error PROPAGATES. When
   * the caller is inside a `$transaction`, the mutation rolls back together
   * with the missing audit row. Losing the mutation is preferable to losing
   * the audit trail (docs/04-data-model.md treats audit as non-optional for
   * Phase 4 verification flows).
   *
   * No retries, no fallback-to-file: Postgres is the single source of truth.
   */
  async log(input: AuditEntryInput): Promise<void> {
    this._assertSystemPrefix(input);

    const data = this._buildCreateInput(input);
    const writer = this._pickWriter(input.tx);

    await writer.auditLog.create({ data });
  }

  // ─── internals ────────────────────────────────────────────

  /**
   * `actor: 'system'` actions MUST be tagged with the `system.` prefix so
   * downstream audit consumers can filter cron / worker activity out of
   * operator dashboards. Anything else is a programming error — fail loud.
   */
  private _assertSystemPrefix(input: AuditEntryInput): void {
    if (input.actor === 'system' && !input.action.startsWith('system.')) {
      throw new Error(
        `audit.log: action "${input.action}" with actor='system' must start with "system." prefix`,
      );
    }
  }

  private _buildCreateInput(
    input: AuditEntryInput,
  ): Prisma.AuditLogUncheckedCreateInput {
    const actorFields = this._actorFields(input.actor);
    const before = sanitiseJson(input.before);
    const after = sanitiseJson(input.after);

    return {
      action: input.action,
      targetType: input.targetType ?? null,
      targetKey: input.targetKey ?? null,
      // Unchecked variant exposes scalar FKs directly — perfect for an audit
      // write that never wants to thread relation-connect graphs.
      userId: actorFields.userId,
      userRole: actorFields.userRole,
      ipAddress: actorFields.ipAddress,
      reason: input.reason ?? null,
      // Prisma JSON columns: passing `undefined` skips the field (column
      // stays NULL on insert). For an explicit value we cast through
      // `InputJsonValue`; sanitiseJson() has already round-tripped the
      // payload so it's structurally JSON-safe.
      before: before === undefined ? undefined : (before as Prisma.InputJsonValue),
      after: after === undefined ? undefined : (after as Prisma.InputJsonValue),
      // metadata distinction: `undefined` means "caller didn't provide one"
      // -> column stays NULL. An empty object `{}` from the caller MUST be
      // persisted as `{}`, not collapsed to NULL — covered by the spec.
      metadata:
        input.metadata === undefined
          ? undefined
          : (input.metadata as Prisma.InputJsonValue),
    };
  }

  private _actorFields(actor: AuditActor): {
    userId: string | null;
    userRole: Prisma.AuditLogUncheckedCreateInput['userRole'];
    ipAddress: string | null;
  } {
    if (actor === 'system') {
      return { userId: null, userRole: null, ipAddress: null };
    }
    return {
      userId: actor.userId,
      // `Role` (shared zod) and `Role` (Prisma enum) share string values; the
      // Prisma generator accepts the literal union directly.
      userRole:
        actor.userRole as Prisma.AuditLogUncheckedCreateInput['userRole'],
      ipAddress: actor.ipAddress ?? null,
    };
  }

  /**
   * Pick the Prisma delegate target. Caller-supplied `tx` wins so the audit
   * write joins the caller's transaction. Otherwise we go through the shared
   * extended client (a separate connection — no ambient-transaction magic).
   */
  private _pickWriter(
    tx: Prisma.TransactionClient | undefined,
  ): PrismaAuditDelegate {
    if (tx) return tx as unknown as PrismaAuditDelegate;
    return this.prisma.client as unknown as PrismaAuditDelegate;
  }
}

/**
 * Round-trip through JSON to drop `undefined`, functions, symbols, NaN, etc.
 * The result is guaranteed JSON-safe so Prisma's Json columns accept it
 * without a runtime cast at the type level.
 *
 * Returns `undefined` when the input is `undefined` so we can distinguish
 * "caller didn't set this field" from "caller set it to null".
 */
function sanitiseJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  // `JSON.stringify` of `undefined` yields the string "undefined" only at the
  // top level — handled above. For nested undefineds it omits the key, which
  // is exactly what we want.
  const serialised = JSON.stringify(value);
  if (serialised === undefined) return undefined;
  return JSON.parse(serialised) as unknown;
}
