import { BadRequestException, Injectable } from '@nestjs/common';

import type {
  AuditFilters,
  AuditLogDto,
  AuditLogListDto,
} from '@magguarantee/shared';

import {
  AuditQueryRepository,
  type AuditLogRow,
} from './audit-query.repository';

/**
 * Phase 4.5 — Audit read-side service.
 *
 * Reads from `audit_log` with optional filters + cursor pagination per
 * docs/13-api-design.md#audit-апи-v1audit-admin. The write-side
 * (`AuditWriter`, `AuditInterceptor`) is intentionally separate — this
 * service has read-only Prisma access and never opens a transaction.
 *
 * Cursor format: base64-encoded `<ISO-createdAt>|<id>` tuple. Opaque to
 * clients — they only need to forward the value verbatim on the next page.
 */
@Injectable()
export class AuditQueryService {
  constructor(private readonly repo: AuditQueryRepository) {}

  async list(filters: AuditFilters): Promise<AuditLogListDto> {
    const from = this._parseDate(filters.from, 'from', 'start');
    const to = this._parseDate(filters.to, 'to', 'end');
    const cursor = filters.cursor
      ? this._decodeCursor(filters.cursor)
      : undefined;

    const rows = await this.repo.list({
      ...(filters.targetType ? { targetType: filters.targetType } : {}),
      ...(filters.targetKey ? { targetKey: filters.targetKey } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(cursor ? { cursor } : {}),
      limit: filters.limit,
    });

    // Repo fetched `limit + 1` rows so we can tell whether more pages exist.
    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, filters.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? this._encodeCursor(page[page.length - 1]!)
        : null;

    return {
      items: page.map((r) => this._toDto(r)),
      nextCursor,
    };
  }

  // ── internals ──────────────────────────────────────────────

  /**
   * Parse a `from` / `to` filter into a `Date`. Accepts either a plain ISO
   * date (`YYYY-MM-DD`) or a full ISO datetime. Returns `undefined` when the
   * input is empty. Throws `BadRequestException` for unparseable values so the
   * global filter surfaces a 400 with the field name.
   *
   * `edge` widens a **date-only** input to the matching end of that day:
   * `start` → `T00:00:00.000Z`, `end` → `T23:59:59.999Z`. The admin filter bar
   * sends `<input type="date">` values, and the range is applied as
   * `createdAt >= from AND createdAt <= to` — without the widening, picking
   * "do: 2026-05-15" would cut the day off at midnight and `from = to = today`
   * would always return an empty page.
   *
   * Full datetimes pass through untouched — the caller already stated the
   * exact instant it wants.
   */
  private _parseDate(
    value: string | undefined,
    field: string,
    edge: 'start' | 'end',
  ): Date | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    const date = new Date(
      isDateOnly
        ? `${trimmed}T${edge === 'end' ? '23:59:59.999' : '00:00:00.000'}Z`
        : trimmed,
    );
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `Invalid date for filter \`${field}\`: ${value}`,
      );
    }
    return date;
  }

  /**
   * Encode the tail row's `(createdAt, id)` tuple into a base64 cursor.
   * Format `<ISO>|<id>` keeps the cursor self-describing without bringing
   * in a JSON parser on the hot path.
   */
  private _encodeCursor(row: AuditLogRow): string {
    const raw = `${row.createdAt.toISOString()}|${row.id}`;
    return Buffer.from(raw, 'utf8').toString('base64url');
  }

  /**
   * Decode a cursor back into `{createdAt, id}`. Malformed cursors are
   * surfaced as 400 — the global filter formats the RFC-7807 envelope.
   * Forward compatibility: we tolerate trailing fields beyond the first
   * two so future cursor extensions don't break old clients.
   */
  private _decodeCursor(value: string): { createdAt: Date; id: string } {
    let raw: string;
    try {
      raw = Buffer.from(value, 'base64url').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    const [iso, id] = raw.split('|');
    if (!iso || !id) throw new BadRequestException('Invalid cursor');
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Invalid cursor');
    }
    return { createdAt, id };
  }

  private _toDto(row: AuditLogRow): AuditLogDto {
    return {
      id: row.id,
      action: row.action,
      targetType: row.targetType,
      targetKey: row.targetKey,
      userId: row.userId,
      userLogin: row.userLogin,
      userName: row.userName,
      userRole: row.userRole,
      before: row.before ?? null,
      after: row.after ?? null,
      reason: row.reason,
      metadata: row.metadata ?? null,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
