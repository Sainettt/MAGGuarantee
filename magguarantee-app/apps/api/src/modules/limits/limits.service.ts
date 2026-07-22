import { Injectable, UnprocessableEntityException } from '@nestjs/common';

import type {
  MonthlyLimitDto,
  MonthlyLimitListDto,
  UpdateMonthlyLimitDto,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit/audit-context';
import {
  LimitsRepository,
  type MonthlyLimitRow,
} from './limits.repository';

/**
 * Phase 4.5 — MonthlyLimit admin service.
 *
 * Two operations per docs/13-api-design.md#limits:
 *  - `list(year)` — read-only, gap-filled on the frontend.
 *  - `upsert(yearMonth, dto)` — write path, runs inside the
 *    `AuditInterceptor`'s ambient transaction (atomic mutation + audit row).
 *
 * No business validation beyond the Zod-level schema (`UpdateMonthlyLimitSchema`
 * already enforces "at least one field present" + positivity). The repository
 * relies on the composite unique `(year, month)` to keep upserts atomic.
 *
 * Audit `before` snapshot is captured before upsert when an existing row
 * exists, so the interceptor's diff view shows what changed.
 */
@Injectable()
export class LimitsService {
  constructor(private readonly repo: LimitsRepository) {}

  // ── List ────────────────────────────────────────────────

  async listForYear(year: number): Promise<MonthlyLimitListDto> {
    const rows = await this.repo.listForYear(year);
    return rows.map((r) => this._toDto(r));
  }

  // ── Upsert ──────────────────────────────────────────────

  async upsert(
    yearMonth: string,
    dto: UpdateMonthlyLimitDto,
  ): Promise<MonthlyLimitDto> {
    const parsed = this._parseYearMonth(yearMonth);

    // Capture the pre-mutation snapshot for the audit `before` field, IF a
    // row exists. The interceptor trims this to the keys present in `after`,
    // so it stays a small diff payload (id + kmPerDay + ratePerKm).
    const existing = await this.repo.findByYearMonth(parsed.year, parsed.month);
    if (existing) {
      AuditContext.setBefore({
        id: existing.id,
        year: existing.year,
        month: existing.month,
        kmPerDay: existing.kmPerDay,
        ratePerKm: existing.ratePerKm,
        kmPerSaturday: existing.kmPerSaturday,
      });
    }

    const row = await this.repo.upsert({
      year: parsed.year,
      month: parsed.month,
      ...(dto.kmPerDay !== undefined ? { kmPerDay: dto.kmPerDay } : {}),
      ...(dto.ratePerKm !== undefined ? { ratePerKm: dto.ratePerKm } : {}),
      ...(dto.kmPerSaturday !== undefined
        ? { kmPerSaturday: dto.kmPerSaturday }
        : {}),
    });
    return this._toDto(row);
  }

  // ── Internals ───────────────────────────────────────────

  /**
   * Parse `YYYY-MM` into `{year, month}`. The route-level Zod pipe already
   * enforces the textual shape — this is defence in depth for the rare case
   * where the controller is called outside of NestJS routing (tests).
   */
  private _parseYearMonth(value: string): { year: number; month: number } {
    const match = /^(\d{4})-(\d{2})$/u.exec(value);
    if (!match) {
      throw new UnprocessableEntityException(
        'yearMonth must be in `YYYY-MM` format (e.g. `2026-05`).',
      );
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new UnprocessableEntityException(
        `yearMonth: year ${year} is outside the supported range (2000–2100).`,
      );
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new UnprocessableEntityException(
        `yearMonth: month ${month} is outside the supported range (01–12).`,
      );
    }
    return { year, month };
  }

  private _toDto(row: MonthlyLimitRow): MonthlyLimitDto {
    return {
      id: row.id,
      year: row.year,
      month: row.month,
      kmPerDay: row.kmPerDay,
      ratePerKm: row.ratePerKm,
      kmPerSaturday: row.kmPerSaturday,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
