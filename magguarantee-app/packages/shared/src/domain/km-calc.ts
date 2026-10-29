// `calcKmGwarant` — the guarantee engine, priced per ISO WEEK (2026-10-29).
//
// Port of the legacy `calcKmGwarantPerMonth` (`Code.gs:862`) with the limits
// unit moved from calendar months to ISO 8601 weeks (docs/01-overview.md
// §«Расчёт гарантии»). The day-level math is unchanged — weekday fractions
// from `timeFrom`/`timeTo`, EU-ban / Easter exclusions, the proportional
// `hoursAdjusted` correction, the km-weighted EUR/km rate. What moved:
//  - limits are looked up per ISO week (`YYYY-Www`), with the same per-field
//    fallback (540 km/day, 0.5 EUR/km, 0 km/Saturday);
//  - the "odd Saturday of the month" rule is gone: a week's Saturday is
//    credited iff that week's `kmPerSaturday > 0`, the Saturday lies inside
//    the claim period and it is not an EU-ban day;
//  - one breakdown row per ISO week the period touches.
//
// Lives in `@magguarantee/shared` so the API (NestJS) and the web (Next.js)
// price claims with the same code. Pure, never throws, TIME-ZONE INDEPENDENT:
// the calendar is walked on integer day numbers (`civil-date.ts`), never on
// local `Date`s. The ≥30 fixture suite at `tests/km-calc.test.ts` guards it.

import {
  civilFromDayNumber,
  dayNumberFromIso,
  formatIsoWeekKeyRaw,
  isoFromDayNumber,
  isoWeekOfDayNumber,
  isoWeekdayOfDayNumber,
} from './civil-date';
import { getEUBanDays } from './eu-calendar';

// ─── Fallbacks ───────────────────────────────────────────

/**
 * km/day for a week with no `weekly_limits` row / a NULL `kmPerDay`
 * (legacy `Code.gs:32` `KM_DZIENNIE`; `AppConfig.km_dziennie_default`).
 * NOT applied to a `0` — that is a deliberately switched-off week.
 */
export const FALLBACK_KM_PER_DAY = 540;

/**
 * EUR/km for a week with no row / a NULL `ratePerKm` (legacy `Code.gs:31`
 * `STAWKA_EUR_ZA_KM`; `AppConfig.stawka_eur_default`).
 */
export const FALLBACK_RATE_PER_KM = 0.5;

/**
 * km for a week's Saturday when the week has no row / a NULL `kmPerSaturday`.
 *
 * ⚠️ PINNED AT 0. `resolveKmPerSaturday` below treats a week value of `0` as
 * "not set" and falls through to the fallback, so the day this constant turns
 * positive, every week that explicitly switched its Saturday off would silently
 * switch it back on. The "engine pin" fixtures in
 * `tests/claim-settlement.test.ts` lock this; changing it is a business
 * decision (docs/19-known-quirks.md #7), not a tweak.
 */
export const FALLBACK_KM_PER_SATURDAY = 0;

// ─── Public types ────────────────────────────────────────

/** km/day + EUR/km (+ km for the Saturday) of one ISO week. */
export interface WeekLimit {
  /** Daily km limit for Mon–Fri (e.g. 540). `0` ⇒ weekday guarantee OFF. */
  kmPerDay: number;
  /** EUR per km — for the weekdays AND the Saturday of the week. */
  ratePerKm: number;
  /**
   * km credited for the week's Saturday. OPT-IN: omitted, `<= 0` or `NaN`
   * falls through to the fallback (pinned at 0 ⇒ the Saturday is excluded
   * like a Sunday). `> 0` ⇒ the Saturday counts as one whole day worth this
   * many km, priced at the week's `ratePerKm`.
   */
  kmPerSaturday?: number;
}

/** The global fallback as one value — what an unconfigured week is priced with. */
export const FALLBACK_WEEK_LIMIT: Readonly<Required<WeekLimit>> = Object.freeze({
  kmPerDay: FALLBACK_KM_PER_DAY,
  ratePerKm: FALLBACK_RATE_PER_KM,
  kmPerSaturday: FALLBACK_KM_PER_SATURDAY,
});

/**
 * One EU heavy-vehicle ban day inside the claim period that was dropped from
 * the count. Ordinary weekends are NOT listed (they would dominate the list).
 * Two kinds of day land here: a WEEKDAY on a ban / holiday, and a week's
 * Saturday on a ban / holiday when that week has `kmPerSaturday > 0` (not paid,
 * not counted as a day). A Saturday of a week without Saturday guarantee is
 * skipped silently, like a Sunday.
 */
export interface ExcludedDay {
  /** ISO calendar date `YYYY-MM-DD`. */
  date: string;
  /** Holiday label from `eu-calendar`, e.g. `'Boze Narodzenie'`. */
  label: string;
}

/**
 * One breakdown row per ISO week the claim period touches — the engine-side
 * twin of `WeekBreakdownSchema` (docs/13-api-design.md «WeekBreakdown»).
 * Total days of the week = `workingDays + saturdaysCounted`;
 * Σ `kmInWeek` = `kmGuaranteed`.
 */
export interface WeekBreakdown {
  /** `YYYY-Www` — the week key and the key of the limits snapshot. */
  isoWeek: string;
  /** Monday of the full week, `YYYY-MM-DD`. */
  weekStart: string;
  /** Sunday of the full week, `YYYY-MM-DD`. */
  weekEnd: string;
  /** First day of the week INSIDE the claim period. */
  periodStart: string;
  /** Last day of the week INSIDE the claim period. */
  periodEnd: string;
  /** Counted Mon–Fri days, after EU-ban / fractions / `hoursAdjusted` (2 dp). */
  workingDays: number;
  /** km/day applied to the week. */
  kmPerDay: number;
  /** EUR/km applied to the week (weekdays and the Saturday share it). */
  ratePerKm: number;
  /** `1` when the week's Saturday was credited, else `0`. Never fractioned. */
  saturdaysCounted: 0 | 1;
  /** km for the week's Saturday applied (`0` ⇒ the week has no Saturday guarantee). */
  kmPerSaturday: number;
  /** `round(saturdaysCounted × kmPerSaturday)`. */
  kmFromSaturdays: number;
  /** The credited Saturday (`[]` when not credited); `length === saturdaysCounted`. */
  saturdayDays: string[];
  /** Grand total = `round(workingDays × kmPerDay) + kmFromSaturdays`. */
  kmInWeek: number;
  /** Holidays / EU bans dropped from the count (weekends not listed). */
  excludedDays: ExcludedDay[];
}

export interface KmCalcResult {
  /**
   * Counted days of the period (2 dp) = adjusted weekday days + credited
   * Saturdays. `hoursAdjusted` reduces only the weekday part.
   */
  totalDays: number;
  /**
   * Counted days BEFORE `hoursAdjusted` (raw weekday days + credited
   * Saturdays, 2 dp). Equals `totalDays` without an adjustment. Backs the
   * «surowych / zaliczonych» `<HoursReadout>` (docs/14 §Phase 3.1).
   */
  rawTotalDays: number;
  /** Σ `kmInWeek` over the breakdown. */
  kmGuaranteed: number;
  /** EUR/km weighted by each week's km share, 3 dp; the fallback rate when 0 km. */
  ratePerKmEffective: number;
  /** One row per ISO week of the period, ascending. */
  breakdown: WeekBreakdown[];
  /**
   * The period's first calendar day + the fraction of it credited (0..1, 2 dp):
   * 0 when excluded (Sunday / EU-ban weekday / a Saturday that is not
   * credited), 1 for a whole counted day or a credited Saturday, the time
   * fraction for a counted weekday. RAW — before `hoursAdjusted` (a week-level
   * distribution, not a per-day edit). `null` only for an invalid/empty range.
   */
  firstDay: { date: string; fraction: number } | null;
  /** Same for the period's last calendar day (single-day period ⇒ same as `firstDay`). */
  lastDay: { date: string; fraction: number } | null;
}

export interface KmCalcInput {
  /** ISO calendar date `YYYY-MM-DD`. */
  dateStart: string;
  /** ISO calendar date `YYYY-MM-DD` (inclusive). */
  dateEnd: string;
  /**
   * Downtime/service correction in hours (legacy `korektaGodzin`), deducted
   * from the weekday days of weeks with `kmPerDay > 0`, proportionally.
   * `0` / `undefined` ⇒ no correction.
   */
  hoursAdjusted?: number;
  /** Per-week limits keyed by `YYYY-Www`. Weeks without an entry use `fallback`. */
  limits: Record<string, WeekLimit>;
  /** Per-field fallback for weeks without an entry (normally {@link FALLBACK_WEEK_LIMIT}). */
  fallback: WeekLimit;
  /**
   * `HH:mm` start on the first day: that day counts `(24 − h) / 24`. A
   * single-day period with both times counts `(timeTo − timeFrom) / 24`.
   */
  timeFrom?: string | null;
  /** `HH:mm` stop on the last day: that day counts `h / 24`. */
  timeTo?: string | null;
}

/** How a week's Saturday shows up in the breakdown (docs/14 §18.12, column «Sob.»). */
export type WeekSaturdayStatus = 'counted' | 'notCounted' | 'none';

// ─── Internals ───────────────────────────────────────────

interface WeekAcc {
  isoWeek: string;
  /** Day number of the week's Monday. */
  monday: number;
  /** Day numbers of the first / last day of the week inside the period. */
  periodStart: number;
  periodEnd: number;
  /** Fractional WEEKDAY days. `hoursAdjusted` is applied to this only. */
  rawDays: number;
  saturdaysCounted: 0 | 1;
  saturdayDays: string[];
  kmPerDay: number;
  ratePerKm: number;
  kmPerSaturday: number;
  excludedDays: ExcludedDay[];
}

interface WalkContext {
  startDay: number;
  endDay: number;
  hStart: number | null;
  hStop: number | null;
  limits: Record<string, WeekLimit>;
  fallback: WeekLimit;
  banDays: Map<string, string>;
}

interface WalkResult {
  weeks: WeekAcc[];
  weekdayRawTotal: number;
  saturdayTotal: number;
  firstDay: { date: string; fraction: number } | null;
  lastDay: { date: string; fraction: number } | null;
}

/** Parses `HH:mm` → fractional hours (`'12:30'` → `12.5`). */
function parseHhMm(s: string | null | undefined): number | null {
  if (s === null || s === undefined || s === '') return null;
  const [hRaw, mRaw] = String(s).trim().split(':');
  if (hRaw === undefined || mRaw === undefined) return null;
  const h = Number.parseInt(hRaw, 10);
  const mm = Number.parseInt(mRaw, 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h + mm / 60;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** cfg → fallback → 0; a `0` / negative / non-finite week value falls through. */
function resolveKmPerSaturday(
  cfgValue: number | undefined,
  fallbackValue: number | undefined,
): number {
  if (typeof cfgValue === 'number' && Number.isFinite(cfgValue) && cfgValue > 0) {
    return cfgValue;
  }
  if (
    typeof fallbackValue === 'number' &&
    Number.isFinite(fallbackValue) &&
    fallbackValue > 0
  ) {
    return fallbackValue;
  }
  return 0;
}

/**
 * Limits of one week, per field: the week's finite value (a `0` included) or
 * the fallback (legacy `getMonthLimit` / `getMonthRate`, `Code.gs:850-858`).
 */
function resolveWeekLimit(
  limits: Record<string, WeekLimit>,
  fallback: WeekLimit,
  key: string,
): Required<WeekLimit> {
  const cfg = limits[key];
  return {
    kmPerDay: cfg && Number.isFinite(cfg.kmPerDay) ? cfg.kmPerDay : fallback.kmPerDay,
    ratePerKm: cfg && Number.isFinite(cfg.ratePerKm) ? cfg.ratePerKm : fallback.ratePerKm,
    kmPerSaturday: resolveKmPerSaturday(cfg?.kmPerSaturday, fallback.kmPerSaturday),
  };
}

/** Credited weight of a WEEKDAY from its position + `timeFrom`/`timeTo` (`Code.gs:897-906`). */
function fractionForDay(
  isFirst: boolean,
  isLast: boolean,
  hStart: number | null,
  hStop: number | null,
): number {
  if (isFirst && isLast) {
    if (hStart !== null && hStop !== null) return Math.max(0, hStop - hStart) / 24;
    if (hStart !== null) return (24 - hStart) / 24;
    if (hStop !== null) return hStop / 24;
    return 1;
  }
  if (isFirst) return hStart !== null ? (24 - hStart) / 24 : 1;
  if (isLast) return hStop !== null ? hStop / 24 : 1;
  return 1;
}

/** A fresh accumulator for the week containing `day` (its first day in the period). */
function openWeek(day: number, ctx: WalkContext): WeekAcc {
  const { isoYear, isoWeek } = isoWeekOfDayNumber(day);
  const key = formatIsoWeekKeyRaw(isoYear, isoWeek);
  const limit = resolveWeekLimit(ctx.limits, ctx.fallback, key);
  return {
    isoWeek: key,
    monday: day - isoWeekdayOfDayNumber(day) + 1,
    periodStart: day,
    periodEnd: day,
    rawDays: 0,
    saturdaysCounted: 0,
    saturdayDays: [],
    kmPerDay: limit.kmPerDay,
    ratePerKm: limit.ratePerKm,
    kmPerSaturday: limit.kmPerSaturday,
    excludedDays: [],
  };
}

/**
 * Book one calendar day into its week and return the weight credited for it
 * (0 for Sunday / ban / a Saturday that is not credited; 1 for a credited
 * Saturday; the time fraction for a counted weekday).
 */
function creditDay(acc: WeekAcc, day: number, ctx: WalkContext): number {
  const weekday = isoWeekdayOfDayNumber(day);
  if (weekday === 7) return 0; // Sunday — always excluded, silently.

  const date = isoFromDayNumber(day);
  const banLabel = ctx.banDays.get(date);

  if (weekday === 6) {
    // Saturday — credited only when the week opts in (`kmPerSaturday > 0`).
    if (acc.kmPerSaturday <= 0) return 0; // no Saturday guarantee: like a Sunday
    if (banLabel !== undefined) {
      acc.excludedDays.push({ date, label: banLabel }); // not paid, not a day
      return 0;
    }
    acc.saturdaysCounted = 1;
    acc.saturdayDays.push(date);
    return 1; // whole day — never fractioned by timeFrom / timeTo
  }

  if (banLabel !== undefined) {
    acc.excludedDays.push({ date, label: banLabel });
    return 0;
  }
  const fraction = fractionForDay(
    day === ctx.startDay,
    day === ctx.endDay,
    ctx.hStart,
    ctx.hStop,
  );
  acc.rawDays += fraction;
  return fraction;
}

/** Walk `[startDay … endDay]` once, opening a new week on every Monday. */
function accumulateWeeks(ctx: WalkContext): WalkResult {
  const weeks: WeekAcc[] = [];
  let current: WeekAcc | undefined;
  let weekdayRawTotal = 0;
  let saturdayTotal = 0;
  let firstDay: WalkResult['firstDay'] = null;
  let lastDay: WalkResult['lastDay'] = null;

  for (let day = ctx.startDay; day <= ctx.endDay; day += 1) {
    if (current === undefined || isoWeekdayOfDayNumber(day) === 1) {
      current = openWeek(day, ctx);
      weeks.push(current);
    }
    current.periodEnd = day;

    const credited = creditDay(current, day, ctx);
    if (isoWeekdayOfDayNumber(day) === 6) saturdayTotal += credited;
    else weekdayRawTotal += credited;

    // Boundary days report the RAW credited fraction captured here.
    if (day === ctx.startDay) {
      firstDay = { date: isoFromDayNumber(day), fraction: round2(credited) };
    }
    if (day === ctx.endDay) {
      lastDay = { date: isoFromDayNumber(day), fraction: round2(credited) };
    }
  }

  return { weeks, weekdayRawTotal, saturdayTotal, firstDay, lastDay };
}

/**
 * Deduct `hoursAdjusted` from the weekday days, proportionally across the
 * weeks with `kmPerDay > 0` (`Code.gs:5228-5249`, per week instead of per
 * month). Mutates the accumulators; returns the adjusted weekday total.
 * Saturdays are never touched.
 */
function applyHoursAdjustment(
  weeks: WeekAcc[],
  rawTotalDays: number,
  hoursAdjusted: number,
): number {
  if (!(hoursAdjusted > 0) || rawTotalDays <= 0) return rawTotalDays;
  const korektaDni = round2(hoursAdjusted / 24);
  const adjusted = Math.max(0, round2(rawTotalDays - korektaDni));

  const totalActiveDays = weeks
    .filter((w) => w.kmPerDay > 0)
    .reduce((sum, w) => sum + w.rawDays, 0);
  if (totalActiveDays > 0) {
    for (const w of weeks) {
      if (w.kmPerDay > 0) {
        const share = (w.rawDays / totalActiveDays) * korektaDni;
        w.rawDays = Math.max(0, round2(w.rawDays - share));
      }
    }
  }
  return adjusted;
}

function toBreakdownRow(acc: WeekAcc): WeekBreakdown {
  const workingDays = round2(acc.rawDays);
  const kmFromSaturdays = Math.round(acc.saturdaysCounted * acc.kmPerSaturday);
  return {
    isoWeek: acc.isoWeek,
    weekStart: isoFromDayNumber(acc.monday),
    weekEnd: isoFromDayNumber(acc.monday + 6),
    periodStart: isoFromDayNumber(acc.periodStart),
    periodEnd: isoFromDayNumber(acc.periodEnd),
    workingDays,
    kmPerDay: acc.kmPerDay,
    ratePerKm: acc.ratePerKm,
    saturdaysCounted: acc.saturdaysCounted,
    kmPerSaturday: acc.kmPerSaturday,
    kmFromSaturdays,
    saturdayDays: acc.saturdayDays,
    kmInWeek: Math.round(workingDays * acc.kmPerDay) + kmFromSaturdays,
    excludedDays: acc.excludedDays,
  };
}

function emptyResult(fallback: WeekLimit): KmCalcResult {
  return {
    totalDays: 0,
    rawTotalDays: 0,
    kmGuaranteed: 0,
    ratePerKmEffective: round3(fallback.ratePerKm),
    breakdown: [],
    firstDay: null,
    lastDay: null,
  };
}

// ─── Public entry points ─────────────────────────────────

/**
 * Guaranteed kilometres + per-ISO-week breakdown for one claim period
 * (docs/01-overview.md §«Расчёт гарантии»). Invalid or inverted dates give an
 * empty result (zeros, no rows, the fallback rate) — never throws.
 */
export function calcKmGwarant(input: KmCalcInput): KmCalcResult {
  const startDay = dayNumberFromIso(input.dateStart);
  const endDay = dayNumberFromIso(input.dateEnd);
  if (startDay === null || endDay === null || startDay > endDay) {
    return emptyResult(input.fallback);
  }

  // `includeSaturdays = true` keeps Saturday holidays in the map so a credited
  // Saturday on a ban is not paid; Sundays are never looked up.
  const banDays = getEUBanDays(
    civilFromDayNumber(startDay).y,
    civilFromDayNumber(endDay).y,
    true,
  );
  const walk = accumulateWeeks({
    startDay,
    endDay,
    hStart: parseHhMm(input.timeFrom ?? null),
    hStop: parseHhMm(input.timeTo ?? null),
    limits: input.limits,
    fallback: input.fallback,
    banDays,
  });

  const adjustedWeekdayTotal = applyHoursAdjustment(
    walk.weeks,
    walk.weekdayRawTotal,
    input.hoursAdjusted ?? 0,
  );

  const breakdown = walk.weeks.map(toBreakdownRow);
  const kmGuaranteed = breakdown.reduce((sum, w) => sum + w.kmInWeek, 0);
  // Weekdays and the Saturday share the week's rate, so a week contributes its
  // whole km at one rate (`Code.gs:937`, per week).
  const weightedRateSum = breakdown.reduce((sum, w) => sum + w.kmInWeek * w.ratePerKm, 0);
  const rawRate =
    kmGuaranteed > 0 ? weightedRateSum / kmGuaranteed : input.fallback.ratePerKm;

  return {
    totalDays: round2(adjustedWeekdayTotal + walk.saturdayTotal),
    rawTotalDays: round2(walk.weekdayRawTotal + walk.saturdayTotal),
    kmGuaranteed,
    ratePerKmEffective: round3(rawRate),
    breakdown,
    firstDay: walk.firstDay,
    lastDay: walk.lastDay,
  };
}

/**
 * The «Sob.» cell of a breakdown row (docs/14 §18.7): `counted` — the week's
 * Saturday was credited; `notCounted` — the week has a Saturday guarantee but
 * its Saturday was not credited (outside the claim period, or an EU-ban day,
 * which is then listed in `excludedDays`); `none` — the week has no Saturday
 * guarantee (`kmPerSaturday = 0`).
 */
export function weekSaturdayStatus(
  row: Pick<WeekBreakdown, 'kmPerSaturday'> & { saturdaysCounted: number },
): WeekSaturdayStatus {
  if (row.saturdaysCounted > 0) return 'counted';
  return row.kmPerSaturday > 0 ? 'notCounted' : 'none';
}
