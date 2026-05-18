// Pure-TS port of `calcKmGwarantPerMonth` (`Code.gs:862`).
//
// Lives in `@magguarantee/shared` so both the API (NestJS) and the web
// (Next.js) compute claim previews from the same code — no drift between
// server-side decision math and client-side preview math.
//
// Observable outcome must match Code.gs for any input; implementation is
// rewritten for immutability and type-safety per the project's "functional
// identity, not byte-perfect copy" rule. The ≥30 fixture suite at
// `tests/km-calc.test.ts` guards the math.

import { fmtIsoDateKey, getEUBanDays } from './eu-calendar';

// ─── Public types ────────────────────────────────────────

/** Daily limit + EUR/km rate for one calendar month. */
export interface MonthLimit {
  /** Daily km limit (e.g. 540). */
  kmPerDay: number;
  /** Rate in EUR per km (e.g. 0.5). */
  ratePerKm: number;
}

/**
 * One EU heavy-vehicle ban day that fell within the claim period and was
 * dropped from the working-day count. Weekends are intentionally NOT
 * surfaced here — they're universal trucking knowledge and would dominate
 * the list. Only the non-obvious exclusions (national holidays,
 * Easter-relative, country-specific bans) are listed so the carrier can
 * see WHY a particular weekday didn't pay.
 */
export interface ExcludedDay {
  /** ISO calendar date `YYYY-MM-DD`. */
  date: string;
  /** Holiday label from `eu-calendar`, e.g. `'Boze Narodzenie'`. */
  label: string;
}

/**
 * Per-month breakdown row in the calculation result. The shape is wider
 * than the GAS version — we expose `yearMonth` (`'YYYY-MM'`) directly,
 * along with the individual `kmPerDay` / `ratePerKm` used so the caller
 * can render or audit the math without recomputing.
 */
export interface MonthBreakdown {
  /** `YYYY-MM` — sortable. */
  yearMonth: string;
  /** Working days that fell into this month (after weekend / EU-ban / fraction). */
  workingDays: number;
  /** Daily limit applied for this month. */
  kmPerDay: number;
  /** EUR/km rate applied for this month. */
  ratePerKm: number;
  /** km guaranteed for this month (= round(workingDays * kmPerDay)). */
  kmInMonth: number;
  /** Holiday days from this month that were dropped from the count. */
  excludedDays: ExcludedDay[];
}

export interface KmCalcResult {
  /** Sum of working days across all months (rounded to 2 decimals). */
  totalDays: number;
  /**
   * Pre-adjustment total working days (sum of monthly raw days before
   * `hoursAdjusted` is applied). Equals `totalDays` when no adjustment.
   * Surfaced so the UI can show both "surowych" (raw) and "zaliczonych"
   * (after correction) hours side-by-side per docs/14-design-system.md
   * §Phase 3.1 "HoursReadout". Same 2-dp rounding as totalDays.
   */
  rawTotalDays: number;
  /** Sum of `kmInMonth` across the breakdown (already rounded). */
  kmGuaranteed: number;
  /** Weighted EUR/km across months proportional to km share. Rounded to 3 decimals. */
  ratePerKmEffective: number;
  /** Per-month rows, sorted by `yearMonth`. */
  breakdown: MonthBreakdown[];
}

export interface KmCalcInput {
  /** ISO calendar date `YYYY-MM-DD`. */
  dateStart: string;
  /** ISO calendar date `YYYY-MM-DD` (inclusive). */
  dateEnd: string;
  /**
   * Optional: hours to subtract from totalDays as a downtime/service
   * adjustment. Mirrors `korektaGodzin` from Code.gs (used at `:5228`+).
   * `0` or `undefined` → no adjustment.
   */
  hoursAdjusted?: number;
  /** Per-month limits keyed by `YYYY-MM`. */
  limits: Record<string, MonthLimit>;
  /** Fallback when the period spans a month with no entry in `limits`. */
  fallback: MonthLimit;
  /**
   * Optional `HH:mm` start time on the first day. If set, the first day's
   * fraction is `(24 - h)/24`. Single-day claims with both `timeFrom` and
   * `timeTo` use `(timeTo - timeFrom)/24`.
   */
  timeFrom?: string | null;
  /**
   * Optional `HH:mm` stop time on the last day. If set, the last day's
   * fraction is `h/24`. See `timeFrom` for the single-day rule.
   */
  timeTo?: string | null;
}

// ─── Internals ───────────────────────────────────────────

interface ParsedDate {
  /** Local-midnight Date used for day-by-day iteration. */
  date: Date;
  year: number;
  /** 0..11 (JS convention). */
  month: number;
  day: number;
}

/**
 * Parses a `YYYY-MM-DD` string into a local-midnight Date plus its
 * components. Returns null on invalid input — caller decides whether to
 * fall through to the empty result (matches Code.gs `isNaN` guard at `:863`).
 */
function parseIsoDate(s: string | null | undefined): ParsedDate | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(year, month, day);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month ||
    d.getDate() !== day
  ) {
    return null;
  }
  return { date: d, year, month, day };
}

/** Parses `HH:mm` → fractional hours (e.g. `'12:30'` → `12.5`). */
function parseHhMm(s: string | null | undefined): number | null {
  if (s === null || s === undefined || s === '') return null;
  const trimmed = String(s).trim();
  const parts = trimmed.split(':');
  const hRaw = parts[0];
  const mRaw = parts[1];
  if (hRaw === undefined || mRaw === undefined) return null;
  const h = Number.parseInt(hRaw, 10);
  const mm = Number.parseInt(mRaw, 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h + mm / 60;
}

/** `YYYY-MM` from year + 0-based month. */
function fmtYearMonth(year: number, monthZeroBased: number): string {
  const m = monthZeroBased + 1;
  return `${year}-${m < 10 ? '0' : ''}${m}`;
}

/** Round to 2 decimals (matches `Math.round(x * 100) / 100`). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round to 3 decimals (matches `Math.round(x * 1000) / 1000`). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Resolve the limits for `(year, month)` falling back to the supplied
 * defaults if no entry exists. Matches `getMonthLimit` + `getMonthRate`
 * from Code.gs at `:850-858`.
 */
function resolveMonthLimit(
  limits: Record<string, MonthLimit>,
  fallback: MonthLimit,
  year: number,
  monthZeroBased: number,
): MonthLimit {
  const key = fmtYearMonth(year, monthZeroBased);
  const cfg = limits[key];
  return {
    kmPerDay: cfg && Number.isFinite(cfg.kmPerDay) ? cfg.kmPerDay : fallback.kmPerDay,
    ratePerKm: cfg && Number.isFinite(cfg.ratePerKm) ? cfg.ratePerKm : fallback.ratePerKm,
  };
}

/**
 * Compute the fractional weight of a day given its position in the period
 * and the optional `timeFrom` / `timeTo`. Mirrors the branch at
 * `Code.gs:897-906` exactly.
 */
function fractionForDay(opts: {
  isFirst: boolean;
  isLast: boolean;
  isSingle: boolean;
  hStart: number | null;
  hStop: number | null;
}): number {
  const { isFirst, isLast, isSingle, hStart, hStop } = opts;
  if (isSingle) {
    if (hStart !== null && hStop !== null) {
      return Math.max(0, hStop - hStart) / 24;
    }
    if (hStart !== null) return (24 - hStart) / 24;
    if (hStop !== null) return hStop / 24;
    return 1;
  }
  if (isFirst) {
    return hStart !== null ? (24 - hStart) / 24 : 1;
  }
  if (isLast) {
    return hStop !== null ? hStop / 24 : 1;
  }
  return 1;
}

interface InternalMonthAcc {
  year: number;
  monthZeroBased: number;
  rawDays: number;
  kmPerDay: number;
  ratePerKm: number;
  excludedDays: ExcludedDay[];
}

/**
 * Walk every day of `[start, end]` (inclusive), accumulating fractional
 * working days into `monthData`, keyed by `YYYY-MM`.
 */
function accumulateMonthDays(
  start: ParsedDate,
  end: ParsedDate,
  hStart: number | null,
  hStop: number | null,
  limits: Record<string, MonthLimit>,
  fallback: MonthLimit,
  banDays: Map<string, string>,
): { monthData: Map<string, InternalMonthAcc>; rawTotalDays: number } {
  const monthData = new Map<string, InternalMonthAcc>();
  let rawTotalDays = 0;

  // Iterate by day. We mutate a single Date locally — the caller's input
  // is never touched (we re-construct from `start.date`).
  const cur = new Date(start.date);
  // Loop guard: terminate at end-day inclusive.
  while (cur <= end.date) {
    const dow = cur.getDay();
    const dateKey = fmtIsoDateKey(cur);
    const curY = cur.getFullYear();
    const curM = cur.getMonth();
    const curD = cur.getDate();
    const isFirst = curY === start.year && curM === start.month && curD === start.day;
    const isLast = curY === end.year && curM === end.month && curD === end.day;
    const isSingle = isFirst && isLast;

    const monthKey = fmtYearMonth(curY, curM);
    let acc = monthData.get(monthKey);
    if (!acc) {
      const ml = resolveMonthLimit(limits, fallback, curY, curM);
      acc = {
        year: curY,
        monthZeroBased: curM,
        rawDays: 0,
        kmPerDay: ml.kmPerDay,
        ratePerKm: ml.ratePerKm,
        excludedDays: [],
      };
      monthData.set(monthKey, acc);
    }

    const isWeekend = dow === 0 || dow === 6;
    const banLabel = banDays.get(dateKey);
    // Record holiday exclusions (only when the day isn't ALSO a weekend —
    // matches the eu-calendar contract which already drops Sat/Sun bans).
    if (!isWeekend && banLabel !== undefined) {
      acc.excludedDays.push({ date: dateKey, label: banLabel });
    }
    // Skip weekends and EU-ban days (matches Code.gs:896).
    if (!isWeekend && banLabel === undefined) {
      const fraction = fractionForDay({ isFirst, isLast, isSingle, hStart, hStop });
      acc.rawDays += fraction;
      rawTotalDays += fraction;
    }

    cur.setDate(cur.getDate() + 1);
  }

  return { monthData, rawTotalDays };
}

/**
 * Apply the `hoursAdjusted` correction proportionally across months that
 * actually carry a positive limit. Mirrors the post-processing at
 * `Code.gs:5228-5249` — kept here in the shared engine so backend and
 * frontend produce identical numbers without each re-implementing it.
 *
 * Returns the adjusted total days. Mutates `accs` in place (immutable
 * inputs are reconstructed by the caller for the breakdown).
 */
function applyHoursAdjustment(
  accs: InternalMonthAcc[],
  rawTotalDays: number,
  hoursAdjusted: number,
): number {
  if (!(hoursAdjusted > 0) || rawTotalDays <= 0) {
    return rawTotalDays;
  }
  const korektaDni = round2(hoursAdjusted / 24);
  const adjusted = Math.max(0, round2(rawTotalDays - korektaDni));

  // Distribute the correction only across months whose limit > 0.
  const totalActiveDays = accs
    .filter((a) => a.kmPerDay > 0)
    .reduce((s, a) => s + a.rawDays, 0);

  if (totalActiveDays > 0) {
    for (const a of accs) {
      if (a.kmPerDay > 0) {
        const share = (a.rawDays / totalActiveDays) * korektaDni;
        a.rawDays = Math.max(0, round2(a.rawDays - share));
      }
    }
  }
  return adjusted;
}

// ─── Public entry-point ──────────────────────────────────

/**
 * Compute guaranteed kilometers + per-month breakdown for one claim.
 *
 * Behavior is observably equivalent to `Code.gs:calcKmGwarantPerMonth`
 * for every input the legacy app could produce. Returns an empty result
 * (zeros, empty breakdown, fallback rate) on invalid date inputs — never
 * throws.
 */
export function calcKmGwarantPerMonth(input: KmCalcInput): KmCalcResult {
  const start = parseIsoDate(input.dateStart);
  const end = parseIsoDate(input.dateEnd);

  // Invalid or inverted range → empty result with fallback rate.
  // (Code.gs returns the same shape at :863 on isNaN.)
  if (!start || !end || start.date > end.date) {
    return {
      totalDays: 0,
      rawTotalDays: 0,
      kmGuaranteed: 0,
      ratePerKmEffective: round3(input.fallback.ratePerKm),
      breakdown: [],
    };
  }

  const hStart = parseHhMm(input.timeFrom ?? null);
  const hStop = parseHhMm(input.timeTo ?? null);

  const banDays = getEUBanDays(start.year, end.year);
  const { monthData, rawTotalDays } = accumulateMonthDays(
    start,
    end,
    hStart,
    hStop,
    input.limits,
    input.fallback,
    banDays,
  );

  // Sort accs by yearMonth before applying the share-based adjustment so
  // the output breakdown is deterministic.
  const accs = [...monthData.values()].sort((a, b) =>
    fmtYearMonth(a.year, a.monthZeroBased).localeCompare(
      fmtYearMonth(b.year, b.monthZeroBased),
    ),
  );

  const adjustedTotal = applyHoursAdjustment(
    accs,
    rawTotalDays,
    input.hoursAdjusted ?? 0,
  );

  // Build breakdown + km totals + weighted rate.
  let kmGuaranteed = 0;
  let weightedRateSum = 0;
  const breakdown: MonthBreakdown[] = accs.map((a) => {
    const days = round2(a.rawDays);
    const km = Math.round(days * a.kmPerDay);
    kmGuaranteed += km;
    weightedRateSum += km * a.ratePerKm;
    return {
      yearMonth: fmtYearMonth(a.year, a.monthZeroBased),
      workingDays: days,
      kmPerDay: a.kmPerDay,
      ratePerKm: a.ratePerKm,
      kmInMonth: km,
      excludedDays: a.excludedDays,
    };
  });

  // Weighted rate proportional to km share — matches Code.gs:937.
  const rawRate =
    kmGuaranteed > 0 ? weightedRateSum / kmGuaranteed : input.fallback.ratePerKm;
  const ratePerKmEffective = round3(rawRate);

  // `totalDays` is the post-adjustment sum, rounded to 2 decimals. When
  // no adjustment was applied this matches `Math.round(rawTotalDays*100)/100`.
  const totalDays = round2(adjustedTotal);

  return {
    totalDays,
    // Pre-adjustment sum, rounded to 2 dp — matches `totalDays` when
    // `hoursAdjusted` is 0 (the common case). Surfaced so the carrier /
    // verifier UI can render `<HoursReadout>` with both values side-by-side.
    rawTotalDays: round2(rawTotalDays),
    kmGuaranteed,
    ratePerKmEffective,
    breakdown,
  };
}
