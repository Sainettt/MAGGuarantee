import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the limits repository. Surfaces Decimal columns
 * as `number | null` so the service can map straight to the wire DTO without
 * a second hop through Prisma's `Decimal` runtime helper.
 */
export interface MonthlyLimitRow {
  id: string;
  year: number;
  month: number;
  kmPerDay: number | null;
  ratePerKm: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertMonthlyLimitData {
  year: number;
  month: number;
  /** When `undefined`, the column is left untouched on UPDATE / NULL on INSERT. */
  kmPerDay?: number;
  ratePerKm?: number;
}

/**
 * Read/write surface for `monthly_limits`. Wraps Prisma so the service never
 * touches `prisma.client.monthlyLimit` directly (api-agent guideline).
 *
 * Goes through `this.prisma.tx` so audited PUTs land on the same ambient
 * transaction as the audit-row write (pre-Phase-4.4 atomic-audit pattern).
 */
@Injectable()
export class LimitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return every monthly-limit row for the supplied year, ordered by month
   * ascending. The frontend handles gap-filling for months without explicit
   * data — no synthesised rows here.
   */
  async listForYear(year: number): Promise<MonthlyLimitRow[]> {
    const rows = await this.prisma.tx.monthlyLimit.findMany({
      where: { year },
      orderBy: { month: 'asc' },
    });
    return rows.map((r) => this._toRow(r));
  }

  /**
   * Look up a single `(year, month)` pair. Returns `null` when absent.
   * Mirrors `findUnique` on the composite key.
   */
  async findByYearMonth(
    year: number,
    month: number,
  ): Promise<MonthlyLimitRow | null> {
    const row = await this.prisma.tx.monthlyLimit.findFirst({
      where: { year, month },
    });
    return row ? this._toRow(row) : null;
  }

  /**
   * Upsert by composite `(year, month)` unique. INSERT path writes whichever
   * fields the caller provided (the others remain NULL); UPDATE path patches
   * only what the caller provided (the others remain untouched). The unique
   * index `monthly_limits_year_month_key` keeps this atomic at the DB level.
   */
  async upsert(data: UpsertMonthlyLimitData): Promise<MonthlyLimitRow> {
    // Prisma's `upsert` needs explicit create/update payloads; we build them
    // separately so the `undefined` semantics line up with the rest of the
    // codebase (omit a field → don't write it).
    const create: Record<string, unknown> = {
      year: data.year,
      month: data.month,
    };
    if (data.kmPerDay !== undefined) create.kmPerDay = data.kmPerDay;
    if (data.ratePerKm !== undefined) create.ratePerKm = data.ratePerKm;

    const update: Record<string, unknown> = {};
    if (data.kmPerDay !== undefined) update.kmPerDay = data.kmPerDay;
    if (data.ratePerKm !== undefined) update.ratePerKm = data.ratePerKm;

    const row = await this.prisma.tx.monthlyLimit.upsert({
      where: { year_month: { year: data.year, month: data.month } },
      create: create as never,
      update: update as never,
    });
    return this._toRow(row);
  }

  // ── internals ──────────────────────────────────────────────

  private _toRow(row: {
    id: string;
    year: number;
    month: number;
    kmPerDay: unknown;
    ratePerKm: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): MonthlyLimitRow {
    return {
      id: row.id,
      year: row.year,
      month: row.month,
      kmPerDay: decimalToNumber(row.kmPerDay),
      ratePerKm: decimalToNumber(row.ratePerKm),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

/**
 * Prisma `Decimal` columns surface as a runtime helper with a `.toNumber()`
 * method; in the test seam (where rows are plain objects) the field is a
 * raw `number` or `null`. Handle both shapes without dragging the Decimal
 * runtime class into the test imports.
 */
function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
