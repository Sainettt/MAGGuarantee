import { Injectable } from '@nestjs/common';

import type { Role } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the audit-query repository. Surfaces the
 * `user` join as `userLogin` / `userName` so the admin UI can render
 * "<login> (<name>)" without a second round-trip.
 *
 * `before` / `after` / `metadata` are typed as `unknown` because each
 * `action` writes its own JSON shape — the admin UI handles per-action
 * rendering.
 */
export interface AuditLogRow {
  id: string;
  action: string;
  targetType: string | null;
  targetKey: string | null;
  userId: string | null;
  userLogin: string | null;
  userName: string | null;
  userRole: Role | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: Date;
}

export interface AuditListFilters {
  targetType?: string;
  targetKey?: string;
  userId?: string;
  /** Case-insensitive substring of `action`, not an exact action name. */
  action?: string;
  from?: Date;
  to?: Date;
  /** Decoded cursor — `{createdAt, id}` tuple pointing at the previous page tail. */
  cursor?: { createdAt: Date; id: string };
  limit: number;
}

/**
 * Read-side repository for `audit_log`. Owns Prisma access per the api-agent
 * convention; the service translates filters / cursors and maps to the
 * wire DTO.
 *
 * Pagination is cursor-based on `(createdAt DESC, id DESC)` — strictly newer
 * rows first, ties broken by id (UUID v4, lexicographic). The composite
 * tiebreaker is important because `createdAt` (millisecond) can repeat
 * under high audit-write load.
 */
@Injectable()
export class AuditQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: AuditListFilters): Promise<AuditLogRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.targetKey) where.targetKey = filters.targetKey;
    if (filters.userId) where.userId = filters.userId;
    // `action` is the admin filter bar's free-text box — substring match,
    // case-insensitive, same convention as the `q` search on the other
    // listings. Exact equality would make the filter unusable: nobody types
    // `delegation.markReturned` in full to find it.
    if (filters.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) range.gte = filters.from;
      if (filters.to) range.lte = filters.to;
      where.createdAt = range;
    }

    // Cursor: keyset pagination on `(createdAt DESC, id DESC)`. Translates
    // to "rows strictly older than (cursor.createdAt, cursor.id)".
    if (filters.cursor) {
      const cursorClause = {
        OR: [
          { createdAt: { lt: filters.cursor.createdAt } },
          {
            AND: [
              { createdAt: filters.cursor.createdAt },
              { id: { lt: filters.cursor.id } },
            ],
          },
        ],
      };
      where.AND = [
        ...((where.AND as Record<string, unknown>[]) ?? []),
        cursorClause,
      ];
    }

    const rows = await this.prisma.tx.auditLog.findMany({
      where,
      include: { user: { select: { login: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
    });
    return rows.map((r) => this._toRow(r));
  }

  // ── internals ──────────────────────────────────────────────

  private _toRow(row: {
    id: string;
    action: string;
    targetType: string | null;
    targetKey: string | null;
    userId: string | null;
    userRole: Role | null;
    user: { login: string; name: string | null } | null;
    before: unknown;
    after: unknown;
    reason: string | null;
    metadata: unknown;
    ipAddress: string | null;
    createdAt: Date;
  }): AuditLogRow {
    return {
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      targetKey: row.targetKey,
      userId: row.userId,
      userLogin: row.user?.login ?? null,
      userName: row.user?.name ?? null,
      userRole: row.userRole,
      before: row.before,
      after: row.after,
      reason: row.reason,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
    };
  }
}
