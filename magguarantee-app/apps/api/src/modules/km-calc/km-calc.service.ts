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
  /**
   * Per-month limits SNAPSHOT (`'YYYY-MM' → MonthLimit`) that must win over
   * whatever `monthly_limits` says today. Rebuilt from a wniosek's persisted
   * `Claim.breakdown` via `limitsSnapshotFromBreakdown` so a recalc of an
   * existing wniosek never silently adopts retroactively edited limits
   * (feature «wyłączane limity gwarancji», 2026-09-20).
   *
   * Merge order is PER MONTH: snapshot ▸ live DB row (per field, see
   * `mergeLimits`) ▸ global fallback. A month absent from the snapshot —
   * e.g. the weryfikator moved `dateEnd` into a new month — is priced from
   * the live DB, which is the only data that exists for it.
   */
  limitsSnapshot?: Record<string, MonthLimit>;
}

/**
 * Raw `monthly_limits` row as loaded from the DB. Every column is
 * independently nullable, and `null` ≠ `0`:
 *  - `null` ⇒ NOT configured ⇒ the global fallback fills THAT field in;
 *  - `0`    ⇒ deliberately switched off ⇒ stays `0` all the way into km-calc.
 * See docs/19-known-quirks.md#monthlyLimit-fallback.
 */
export interface StoredMonthLimit {
  kmPerDay: number | null;
  ratePerKm: number | null;
  kmPerSaturday: number | null;
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
// ⚠️ Pinned at 0 on purpose. The engine's `resolveKmPerSaturday` treats a
// month value of `0` as "not set" and falls through to THIS constant — so the
// day someone makes it positive, every month that explicitly switched
// Saturdays off would silently switch them back on. A regression test
// (`packages/shared/tests/claim-settlement.test.ts` → "engine pin") locks the
// behaviour; changing this constant is a business decision, not a tweak.

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

    // Both reads stay parallel; the per-field fallback merge happens here,
    // AFTER the join, because `_loadMonthlyLimits` must not depend on the
    // fallback (that would serialise the two queries for no reason).
    const [stored, fallback] = await Promise.all([
      this._loadMonthlyLimits(start, end),
      this._resolveFallback(),
    ]);

    const limits = mergeLimits(stored, fallback, input.limitsSnapshot);

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

  /**
   * Does `monthly_limits` carry a row for EVERY calendar month the period
   * touches? Answers the "is the guarantee unconfigured, or deliberately
   * switched off?" question the claims-submit violation text (and the admin
   * diagnostics bucket) needs — a `kmGuaranteed === 0` with all rows present
   * is an admin decision, without them it is a configuration hole.
   *
   * Returns `true` for an invalid/inverted range (there is nothing to
   * configure, and the caller already has a date violation for that).
   */
  async hasConfiguredLimits(
    dateStartIso: string,
    dateEndIso: string,
  ): Promise<boolean> {
    const start = parseIso(dateStartIso);
    const end = parseIso(dateEndIso);
    if (!start || !end || start > end) return true;

    const months = enumerateYearMonth(start, end);
    if (months.length === 0) return true;

    const rows = await this.prisma.client.monthlyLimit.findMany({
      where: { OR: months.map(([year, month]) => ({ year, month })) },
      select: { year: true, month: true },
    });
    const present = new Set(
      rows.map((r) => fmtYearMonth(r.year, r.month)),
    );
    return months.every(([y, m]) => present.has(fmtYearMonth(y, m)));
  }

  // ── Internals ───────────────────────────────────────────

  /**
   * Load every `MonthlyLimit` row whose `(year, month)` falls within
   * `[start, end]` (inclusive on both ends). Returns the RAW nullable
   * columns — the fallback merge is `mergeLimits`'s job (it needs the
   * fallback, which is resolved in parallel with this query).
   */
  private async _loadMonthlyLimits(
    start: Date,
    end: Date,
  ): Promise<Record<string, StoredMonthLimit>> {
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

    const out: Record<string, StoredMonthLimit> = {};
    for (const row of rows) {
      out[fmtYearMonth(row.year, row.month)] = {
        kmPerDay: decimalToNumber(row.kmPerDay),
        ratePerKm: decimalToNumber(row.ratePerKm),
        kmPerSaturday: decimalToNumber(row.kmPerSaturday),
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

/**
 * Build the `'YYYY-MM' → MonthLimit` map km-calc consumes.
 *
 * ⚠️ BEHAVIOUR CHANGE (2026-09-20, feature «wyłączane limity gwarancji»).
 * The previous implementation dropped a `monthly_limits` row WHOLESALE when
 * either `kmPerDay` or `ratePerKm` was NULL, letting the engine fall back to
 * 540 km/day + 0.5 EUR/km for that month. With `0` now meaning "guarantee
 * switched off", that was a live defect: a row `{kmPerDay: 0, ratePerKm: NULL}`
 * — admin pressing "off" before a rate was ever seeded — produced the MAXIMUM
 * guarantee instead of none. (It was unreachable only because the write schema
 * used to reject `0`.)
 *
 * The merge is now PER FIELD:
 *  - a row where all three columns are NULL ≡ no row at all (skipped);
 *  - each NULL column is filled from the global fallback INDEPENDENTLY, so
 *    `{kmPerDay: 300, ratePerKm: NULL}` now prices at 300 km/day @ 0.5 EUR/km
 *    (it used to price at 540 @ 0.5 — the intentional part of this change);
 *  - `kmPerSaturday` is copied only when present: omitting the key lets the
 *    engine fold it to 0 ("odd-Saturday feature OFF"), which is the documented
 *    opt-in behaviour and must NOT become a fallback lookup.
 *
 * `snapshot` (when supplied) wins PER MONTH over the merged live row — a
 * wniosek is re-priced with the limits it was originally priced with. Months
 * missing from the snapshot keep the live values; months missing from both
 * are left out entirely and the engine applies the global fallback.
 *
 * Exported for unit testing — the service method is the only production caller.
 */
export function mergeLimits(
  stored: Record<string, StoredMonthLimit>,
  fallback: MonthLimit,
  snapshot?: Record<string, MonthLimit>,
): Record<string, MonthLimit> {
  const out: Record<string, MonthLimit> = {};
  for (const [key, row] of Object.entries(stored)) {
    // A completely empty row carries no admin intent — treat it as "no row"
    // so the engine's own fallback path handles the month.
    if (
      row.kmPerDay === null &&
      row.ratePerKm === null &&
      row.kmPerSaturday === null
    ) {
      continue;
    }
    out[key] = {
      kmPerDay: row.kmPerDay ?? fallback.kmPerDay,
      ratePerKm: row.ratePerKm ?? fallback.ratePerKm,
      // Absent ⇒ omit ⇒ engine folds to 0 (feature OFF for the month).
      ...(row.kmPerSaturday !== null
        ? { kmPerSaturday: row.kmPerSaturday }
        : {}),
    };
  }
  if (snapshot) {
    for (const [key, limit] of Object.entries(snapshot)) {
      out[key] = limit;
    }
  }
  return out;
}


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
