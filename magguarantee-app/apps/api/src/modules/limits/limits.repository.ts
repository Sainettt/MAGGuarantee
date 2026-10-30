import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the limits repository. Surfaces Decimal columns
 * as `number | null` so the service can map straight to the wire DTO without
 * a second hop through Prisma's `Decimal` runtime helper.
 */
export interface WeeklyLimitRow {
  id: string;
  /** ISO year — the calendar year of the week's Thursday. */
  isoYear: number;
  /** 1..52, or 1..53 in a 53-week ISO year. */
  isoWeek: number;
  kmPerDay: number | null;
  ratePerKm: number | null;
  /** Guarantee km for this week's Saturday; `null`/`0` ⇒ the Saturday is not paid. */
  kmPerSaturday: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The partial values of one limits write. A key that is ABSENT is not written:
 * untouched on UPDATE, NULL on INSERT (docs/13 «Limits» — "bez zmian"). `0` is
 * written as `0` ("switched off"). There is no way to write NULL.
 */
export interface WeeklyLimitValues {
  kmPerDay?: number;
  ratePerKm?: number;
  kmPerSaturday?: number;
}

/**
 * Read/write surface for `weekly_limits` (km limits per ISO week, 2026-10-29).
 * Wraps Prisma so the service never touches `prisma.weeklyLimit` directly
 * (api-agent guideline).
 *
 * Every call goes through `this.prisma.tx`, so audited writes land on the
 * `AuditInterceptor`'s ambient transaction together with the audit row.
 * Week existence (`isoWeek` ≤ weeks of `isoYear`) is NOT checked here — the DB
 * has no CHECK for it either; the Zod schemas and the service own it.
 */
@Injectable()
export class LimitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every row of one ISO year, ascending by week. The frontend fills the weeks
   * without a row in itself — no synthesised rows here.
   */
  async listForIsoYear(isoYear: number): Promise<WeeklyLimitRow[]> {
    const rows = await this.prisma.tx.weeklyLimit.findMany({
      where: { isoYear },
      orderBy: { isoWeek: 'asc' },
    });
    return rows.map(toRow);
  }

  /** One `(isoYear, isoWeek)` row, or `null` when the week has none. */
  async findByWeek(isoYear: number, isoWeek: number): Promise<WeeklyLimitRow | null> {
    const row = await this.prisma.tx.weeklyLimit.findUnique({
      where: { isoYear_isoWeek: { isoYear, isoWeek } },
    });
    return row ? toRow(row) : null;
  }

  /**
   * Rows of one ISO year restricted to the given weeks, ascending by week.
   * Backs the `POST /limits/bulk` audit `before` snapshot (only the rows the
   * bulk write will actually touch). An empty `weeks` list short-circuits.
   */
  async listForWeeks(
    isoYear: number,
    weeks: readonly number[],
  ): Promise<WeeklyLimitRow[]> {
    if (weeks.length === 0) return [];
    const rows = await this.prisma.tx.weeklyLimit.findMany({
      where: { isoYear, isoWeek: { in: [...weeks] } },
      orderBy: { isoWeek: 'asc' },
    });
    return rows.map(toRow);
  }

  /**
   * Apply ONE partial payload to several weeks of a single ISO year; returns
   * the rows after the write, ascending by week. Each week goes through the
   * same `upsert` as the single-week path, so the "omitted key ⇒ column
   * untouched" contract is identical. Sequential on purpose: the calls share
   * the ambient audit transaction (`prisma.tx`), and a Prisma interactive
   * transaction is not safe to drive concurrently.
   */
  async upsertMany(
    isoYear: number,
    weeks: readonly number[],
    values: WeeklyLimitValues,
  ): Promise<WeeklyLimitRow[]> {
    const out: WeeklyLimitRow[] = [];
    for (const isoWeek of [...weeks].sort((a, b) => a - b)) {
      out.push(await this.upsert(isoYear, isoWeek, values));
    }
    return out;
  }

  /**
   * Upsert by the composite `(isoYear, isoWeek)` unique. INSERT writes the
   * keys the caller provided (the rest stay NULL); UPDATE patches only those
   * keys (the rest stay untouched). The unique index
   * `weekly_limits_isoYear_isoWeek_key` keeps this atomic at the DB level.
   */
  async upsert(
    isoYear: number,
    isoWeek: number,
    values: WeeklyLimitValues,
  ): Promise<WeeklyLimitRow> {
    const data = pickLimitValues(values);
    const row = await this.prisma.tx.weeklyLimit.upsert({
      where: { isoYear_isoWeek: { isoYear, isoWeek } },
      create: { isoYear, isoWeek, ...data },
      update: data,
    });
    return toRow(row);
  }
}

/**
 * Copy only the keys that carry a value (`0` included). A key present as
 * `undefined` must not reach a column write or the audit payload — the whole
 * contract hinges on "absent ⇒ untouched".
 */
export function pickLimitValues(values: WeeklyLimitValues): WeeklyLimitValues {
  return {
    ...(values.kmPerDay !== undefined ? { kmPerDay: values.kmPerDay } : {}),
    ...(values.ratePerKm !== undefined ? { ratePerKm: values.ratePerKm } : {}),
    ...(values.kmPerSaturday !== undefined
      ? { kmPerSaturday: values.kmPerSaturday }
      : {}),
  };
}

function toRow(row: {
  id: string;
  isoYear: number;
  isoWeek: number;
  kmPerDay: unknown;
  ratePerKm: unknown;
  kmPerSaturday: unknown;
  createdAt: Date;
  updatedAt: Date;
}): WeeklyLimitRow {
  return {
    id: row.id,
    isoYear: row.isoYear,
    isoWeek: row.isoWeek,
    kmPerDay: decimalToNumber(row.kmPerDay),
    ratePerKm: decimalToNumber(row.ratePerKm),
    kmPerSaturday: decimalToNumber(row.kmPerSaturday),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
    'toNumber' in value &&
    typeof (value as { toNumber: unknown }).toNumber === 'function'
  ) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
