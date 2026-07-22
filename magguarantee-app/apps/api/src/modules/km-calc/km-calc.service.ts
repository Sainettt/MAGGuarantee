import { Injectable, Logger } from '@nestjs/common';

import {
  calcKmGwarantPerMonth,
  type KmCalcResult,
  type MonthLimit,
} from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Tracking input for the service. Mirrors the shape consumed by the engine
 * in `@magguarantee/shared`, but takes ISO date strings only (the API layer
 * is the boundary where Postgres → JSON happens).
 */
export interface KmCalcServiceInput {
  /** `YYYY-MM-DD` (inclusive). */
  dateStart: string;
  /** `YYYY-MM-DD` (inclusive). */
  dateEnd: string;
  /** `HH:mm` or null/undefined. */
  timeFrom?: string | null;
  /** `HH:mm` or null/undefined. */
  timeTo?: string | null;
  /** Optional downtime correction (hours). */
  hoursAdjusted?: number;
}

/**
 * Hardcoded fallbacks copied verbatim from the legacy `Code.gs:31-32`
 * (`STAWKA_EUR_ZA_KM: 0.5`, `KM_DZIENNIE: 540`). The seed DOES NOT publish
 * these as `app_config` rows today; if/when admin tooling needs to override
 * them at runtime we will read `km_dziennie_default` / `stawka_eur_default`
 * from `AppConfig` first and fall through to these constants.
 */
const FALLBACK_KM_PER_DAY = 540;
const FALLBACK_RATE_PER_KM = 0.5;
/**
 * Fallback for the odd-Saturday guarantee. `0` keeps the feature OFF for any
 * month with no `MonthlyLimit.kmPerSaturday` — Saturdays behave like ordinary
 * weekends. There is no `AppConfig` override for this today; the value lives on
 * the `MonthlyLimit` row (admin seeds it per-month).
 */
const FALLBACK_KM_PER_SATURDAY = 0;

const APP_CONFIG_KEY_KM_PER_DAY = 'km_dziennie_default';
const APP_CONFIG_KEY_RATE_PER_KM = 'stawka_eur_default';

/**
 * Phase 3 — km-calc service.
 *
 * Loads `MonthlyLimit` rows for the date range, builds a `'YYYY-MM' → MonthLimit`
 * map, resolves the fallback (AppConfig override or hardcoded legacy value),
 * and delegates to `calcKmGwarantPerMonth` from `@magguarantee/shared`.
 *
 * Reference: `Code.gs:850-940` (`getMonthLimit` + `calcKmGwarantPerMonth`).
 */
@Injectable()
export class KmCalcService {
  private readonly logger = new Logger(KmCalcService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute the km-calc result. Never throws on invalid date ranges — the
   * engine returns an empty result, which the caller is expected to validate
   * (e.g. `kmGuaranteed === 0`) before persisting a claim.
   */
  async calc(input: KmCalcServiceInput): Promise<KmCalcResult> {
    const start = parseIso(input.dateStart);
    const end = parseIso(input.dateEnd);

    // If the inputs don't parse, defer to the engine — it returns the same
    // empty shape we'd produce here, with the resolved fallback rate. This
    // avoids two error paths.
    if (!start || !end || start > end) {
      const fallback = await this._resolveFallback();
      return calcKmGwarantPerMonth({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
        timeFrom: input.timeFrom ?? null,
        timeTo: input.timeTo ?? null,
        hoursAdjusted: input.hoursAdjusted ?? 0,
        limits: {},
        fallback,
      });
    }

    const [limits, fallback] = await Promise.all([
      this._loadMonthlyLimits(start, end),
      this._resolveFallback(),
    ]);

    return calcKmGwarantPerMonth({
      dateStart: input.dateStart,
      dateEnd: input.dateEnd,
      timeFrom: input.timeFrom ?? null,
      timeTo: input.timeTo ?? null,
      hoursAdjusted: input.hoursAdjusted ?? 0,
      limits,
      fallback,
    });
  }

  // ── Internals ───────────────────────────────────────────

  /**
   * Load every `MonthlyLimit` row whose `(year, month)` falls within
   * `[start, end]` (inclusive on both ends).
   */
  private async _loadMonthlyLimits(
    start: Date,
    end: Date,
  ): Promise<Record<string, MonthLimit>> {
    const months = enumerateYearMonth(start, end);
    if (months.length === 0) return {};

    const rows = await this.prisma.client.monthlyLimit.findMany({
      where: {
        OR: months.map(([year, month]) => ({ year, month })),
      },
      select: {
        year: true,
        month: true,
        kmPerDay: true,
        ratePerKm: true,
        kmPerSaturday: true,
      },
    });

    const out: Record<string, MonthLimit> = {};
    for (const row of rows) {
      const km = decimalToNumber(row.kmPerDay);
      const rate = decimalToNumber(row.ratePerKm);
      // Skip rows where km OR rate is missing — the engine's fallback logic
      // will substitute. Mirrors `Code.gs:850-858`. A missing `kmPerSaturday`
      // must NOT trigger the skip: it is OPT-IN and simply collapses to 0 (the
      // engine treats that as "feature OFF" for the month).
      if (km === null || rate === null) continue;
      const sat = decimalToNumber(row.kmPerSaturday);
      out[fmtYearMonth(row.year, row.month)] = {
        kmPerDay: km,
        ratePerKm: rate,
        // Omit when absent → engine's `resolveMonthLimit` folds undefined → 0.
        ...(sat !== null ? { kmPerSaturday: sat } : {}),
      };
    }
    return out;
  }

  /**
   * Resolve the fallback (km/day + EUR/km) used when a month has no
   * `MonthlyLimit` row. Tries `AppConfig` first (`km_dziennie_default`,
   * `stawka_eur_default`) and falls back to the legacy constants from
   * `Code.gs:31-32`.
   */
  private async _resolveFallback(): Promise<MonthLimit> {
    const cfg = await this.prisma.client.appConfig.findMany({
      where: {
        key: { in: [APP_CONFIG_KEY_KM_PER_DAY, APP_CONFIG_KEY_RATE_PER_KM] },
      },
      select: { key: true, value: true },
    });
    let kmPerDay = FALLBACK_KM_PER_DAY;
    let ratePerKm = FALLBACK_RATE_PER_KM;
    for (const row of cfg) {
      if (row.key === APP_CONFIG_KEY_KM_PER_DAY) {
        const parsed = Number(row.value);
        if (Number.isFinite(parsed) && parsed > 0) {
          kmPerDay = parsed;
        } else {
          this.logger.warn({
            msg: 'kmCalc.fallback.invalid_km_per_day',
            value: row.value,
          });
        }
      } else if (row.key === APP_CONFIG_KEY_RATE_PER_KM) {
        const parsed = Number(row.value);
        if (Number.isFinite(parsed) && parsed > 0) {
          ratePerKm = parsed;
        } else {
          this.logger.warn({
            msg: 'kmCalc.fallback.invalid_rate_per_km',
            value: row.value,
          });
        }
      }
    }
    // `kmPerSaturday` has no AppConfig override — it is a per-`MonthlyLimit`
    // opt-in, so the global fallback keeps the feature OFF (0).
    return { kmPerDay, ratePerKm, kmPerSaturday: FALLBACK_KM_PER_SATURDAY };
  }
}

// ─── Pure helpers ────────────────────────────────────────

function parseIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/** Returns `[year, month1Based]` pairs covering every calendar month touched. */
function enumerateYearMonth(start: Date, end: Date): [number, number][] {
  const out: [number, number][] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const stop = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= stop) {
    out.push([cur.getFullYear(), cur.getMonth() + 1]);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function fmtYearMonth(year: number, month1Based: number): string {
  return `${year}-${month1Based < 10 ? '0' : ''}${month1Based}`;
}

function decimalToNumber(
  v: { toNumber(): number } | number | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber(): number }).toNumber();
  }
  return null;
}
