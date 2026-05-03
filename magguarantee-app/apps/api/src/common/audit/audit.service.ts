import { Injectable, Logger } from '@nestjs/common';

import type { Role } from '@magguarantee/shared';

import { PrismaService } from '../../modules/prisma/prisma.service';

export interface AuditWrite {
  userId: string | null;
  userRole: Role | null;
  action: string;
  targetType: string | null;
  targetKey: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Single concern: write rows to `audit_log`. Kept separate from the
 * interceptor so the in-transaction variant (Phase 4) can be introduced
 * without rewriting the interceptor's decision logic.
 *
 * Tradeoff (Wave 2): writes happen **after** the response body is materialised
 * — i.e. outside any service-side `prisma.$transaction`. That means an audit
 * row can fail to persist while the underlying mutation succeeded. This is
 * acceptable for Phase 2's CRUD work but not for Phase 4's claim verification.
 *
 * TODO: same-tx flush. Plan: add an `AuditAccumulator` request-scoped
 * provider; services push events to it; interceptor flushes through the
 * same transaction object the service used. See
 * docs/13-api-design.md#audit-на-уровне-api.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(write: AuditWrite): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          userId: write.userId,
          userRole: write.userRole ?? undefined,
          action: write.action,
          targetType: write.targetType,
          targetKey: write.targetKey,
          before: write.before === undefined ? undefined : (write.before as object),
          after: write.after === undefined ? undefined : (write.after as object),
          reason: write.reason,
          ipAddress: write.ipAddress,
          metadata:
            write.metadata === null ? undefined : (write.metadata as object),
        },
      });
      this.logger.log({
        msg: 'audit.write',
        action: write.action,
        targetType: write.targetType,
        targetKey: write.targetKey,
        userId: write.userId,
        userRole: write.userRole,
      });
    } catch (err) {
      // Never let an audit failure tear down the request — the underlying
      // mutation already succeeded by the time the interceptor calls us.
      this.logger.error({
        msg: 'audit.write_failed',
        error: err instanceof Error ? err.message : String(err),
        action: write.action,
        targetType: write.targetType,
        targetKey: write.targetKey,
      });
    }
  }
}
