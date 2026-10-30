import { BadRequestException, Injectable } from '@nestjs/common';

import {
  isValidIsoWeek,
  parseIsoWeekKey,
  type BulkUpdateWeeklyLimitsDto,
  type IsoWeekRef,
  type UpdateWeeklyLimitDto,
  type WeeklyLimitDto,
  type WeeklyLimitListDto,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit/audit-context';
import {
  LimitsRepository,
  pickLimitValues,
  type WeeklyLimitRow,
} from './limits.repository';

/**
 * Km limits per ISO week — admin service (docs/13-api-design.md «Limits —
 * `/api/v1/limits`», since 2026-10-29; replaces the per-month limits).
 *
 *  - `listForIsoYear(isoYear)` — raw `weekly_limits` rows of one ISO year; the
 *    web fills the weeks without a row in itself.
 *  - `upsert(isoWeekKey, dto)` — partial write of one week, inside the
 *    `AuditInterceptor`'s ambient transaction (row + audit row commit together).
 *  - `bulkUpsert(dto)` — the same partial write applied to N weeks of one ISO
 *    year, all inside that one transaction.
 *
 * Value validation (non-negative, at least one key) is the Zod schemas' job
 * and they are the ONLY guard — there is no DB CHECK on these columns. `0` is
 * a legal value ("switched off for this week"); an absent key leaves the
 * column untouched; nothing writes NULL back. Week existence (W53 only in a
 * 53-week ISO year) is checked by the schemas AND re-checked here, because the
 * DB does not constrain `isoWeek` either and a phantom `2027-W53` row would be
 * invisible to every reader.
 */
@Injectable()
export class LimitsService {
  constructor(private readonly repo: LimitsRepository) {}

  // ── List ────────────────────────────────────────────────

  async listForIsoYear(isoYear: number): Promise<WeeklyLimitListDto> {
    const rows = await this.repo.listForIsoYear(isoYear);
    return rows.map(toDto);
  }

  // ── Upsert one week ─────────────────────────────────────

  async upsert(
    isoWeekKey: string,
    dto: UpdateWeeklyLimitDto,
  ): Promise<WeeklyLimitDto> {
    const { isoYear, isoWeek } = this._parseWeekKey(isoWeekKey);

    // Pre-mutation snapshot for the audit `before`, IF the week has a row.
    // The interceptor trims it to the keys present in `after`.
    const existing = await this.repo.findByWeek(isoYear, isoWeek);
    if (existing) AuditContext.setBefore(toSnapshot(existing));

    const row = await this.repo.upsert(isoYear, isoWeek, pickLimitValues(dto));
    return toDto(row);
  }

  // ── Bulk upsert ─────────────────────────────────────────

  /**
   * `POST /limits/bulk` — ONE partial payload applied to several weeks of a
   * single ISO year. Everything runs inside the `AuditInterceptor`'s ambient
   * transaction: all weeks commit together with the audit row, or none do. No
   * `prisma.$transaction` is opened here on purpose (the interceptor already
   * gave us one; nesting would deadlock the pool).
   *
   * Audit: `before` = the affected rows AS THEY WERE (the interceptor keeps a
   * whole-object `before` when `after` is an array), `after` = the rows after
   * the write, `metadata.payload` = the request body (weeks sorted), so the
   * intent survives even for weeks that had no row before.
   */
  async bulkUpsert(dto: BulkUpdateWeeklyLimitsDto): Promise<WeeklyLimitListDto> {
    const weeks = [...dto.weeks].sort((a, b) => a - b);
    this._assertWeeksExist(dto.isoYear, weeks);
    const values = pickLimitValues(dto);

    const existing = await this.repo.listForWeeks(dto.isoYear, weeks);
    AuditContext.setBefore({
      isoYear: dto.isoYear,
      weeks,
      rows: existing.map(toSnapshot),
    });
    AuditContext.setMetadata({
      payload: { isoYear: dto.isoYear, weeks, ...values },
    });

    const rows = await this.repo.upsertMany(dto.isoYear, weeks, values);
    return rows.map(toDto);
  }

  // ── Internals ───────────────────────────────────────────

  /**
   * `YYYY-Www` → `{ isoYear, isoWeek }`. The route-level `IsoWeekParamSchema`
   * already rejects malformed keys and non-existent weeks with 400 — this is
   * defence in depth for callers outside NestJS routing, with the same status.
   */
  private _parseWeekKey(isoWeekKey: string): IsoWeekRef {
    const ref = parseIsoWeekKey(isoWeekKey);
    if (ref === null) {
      throw new BadRequestException(
        'isoWeek must be `YYYY-Www` with a two-digit week that exists in that ISO year (e.g. `2026-W05`).',
      );
    }
    return ref;
  }

  /** Same defence in depth for the bulk body (`BulkUpdateWeeklyLimitsSchema` checks it first). */
  private _assertWeeksExist(isoYear: number, weeks: readonly number[]): void {
    const missing = weeks.filter((week) => !isValidIsoWeek(isoYear, week));
    if (missing.length > 0) {
      throw new BadRequestException(
        `ISO year ${isoYear} has no week(s) ${missing.join(', ')}.`,
      );
    }
  }
}

/** Audit `before` shape of one row (no timestamps — they are noise in a diff). */
function toSnapshot(row: WeeklyLimitRow): Record<string, unknown> {
  return {
    id: row.id,
    isoYear: row.isoYear,
    isoWeek: row.isoWeek,
    kmPerDay: row.kmPerDay,
    ratePerKm: row.ratePerKm,
    kmPerSaturday: row.kmPerSaturday,
  };
}

function toDto(row: WeeklyLimitRow): WeeklyLimitDto {
  return {
    id: row.id,
    isoYear: row.isoYear,
    isoWeek: row.isoWeek,
    kmPerDay: row.kmPerDay,
    ratePerKm: row.ratePerKm,
    kmPerSaturday: row.kmPerSaturday,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
