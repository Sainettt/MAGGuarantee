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
  /**
   * Guarantee km credited for a single qualifying ("odd" — 1st/3rd/5th)
   * Saturday of this calendar month. OPT-IN: when omitted, `<= 0`, or `NaN`,
   * the feature is OFF for the month and Saturdays behave exactly as before
   * (fully excluded — no km, no day, no `excludedDays` entry). When `> 0`,
   * each qualifying Saturday is credited this many km (priced at the SAME
   * `ratePerKm` as weekdays) and counts as one whole day. Optional so the
   * pre-existing fixture suite compiles unchanged (undefined ⇒ 0).
   */
  kmPerSaturday?: number;
}

/**
 * One EU heavy-vehicle ban day that fell within the claim period and was
 * dropped from the count. Ordinary weekends are intentionally NOT surfaced
 * here — they're universal trucking knowledge and would dominate the list.
 * Only the non-obvious exclusions (national holidays, Easter-relative,
 * country-specific bans) are listed so the carrier can see WHY a particular
 * day didn't pay.
 *
 * Two kinds of day land here:
 *  - a WEEKDAY that hit a ban/holiday (the classic case), and
 *  - a QUALIFYING ("odd") Saturday, when the odd-Saturday feature is ON for
 *    the month (`kmPerSaturday > 0`), that fell on a ban/holiday — it is not
 *    paid and not counted as a day, so it is surfaced here with its label.
 *
 * Silently-skipped Saturdays (feature OFF, or an even/non-qualifying Saturday)
 * are NOT surfaced — they behave like ordinary weekends.
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
  /**
   * WEEKDAY working days that fell into this month (Mon–Fri, after EU-ban /
   * fraction / hoursAdjusted). Does NOT include qualifying Saturdays — those
   * live in `saturdaysCounted`. Total days for the month =
   * `workingDays + saturdaysCounted`.
   */
  workingDays: number;
  /** Daily limit applied for this month. */
  kmPerDay: number;
  /** EUR/km rate applied for this month (weekdays AND Saturdays share it). */
  ratePerKm: number;
  /**
   * Number of qualifying ("odd") Saturdays credited in this month. `0` when the
   * feature is OFF (`kmPerSaturday <= 0`) or none fell in the period. Always a
   * whole integer — Saturdays are never fractioned by `timeFrom`/`timeTo`.
   */
  saturdaysCounted: number;
  /**
   * Guarantee km per qualifying Saturday applied for this month (`0` when the
   * feature is OFF). Surfaced so the caller can render / audit the Saturday math.
   */
  kmPerSaturday: number;
  /** km guaranteed from Saturdays this month (= round(saturdaysCounted * kmPerSaturday)). */
  kmFromSaturdays: number;
  /**
   * Grand-total km guaranteed for this month =
   * `round(workingDays * kmPerDay) + kmFromSaturdays`. Summing `kmInMonth`
   * across the breakdown yields `kmGuaranteed`.
   */
  kmInMonth: number;
  /**
   * ISO `YYYY-MM-DD` of each CREDITED (paid) qualifying Saturday in this month
   * — odd ordinal AND `kmPerSaturday > 0` AND NOT on an EU-ban. Ascending
   * (natural walk order). Symmetric with `excludedDays`: a qualifying Saturday
   * that landed on a ban is NOT here (it is in `excludedDays`); even /
   * feature-off Saturdays appear in neither. Invariant:
   * `saturdayDays.length === saturdaysCounted`. Surfaced so the carrier form
   * can flag a boundary Saturday as "counted" without re-deriving the ordinal
   * rule client-side.
   */
  saturdayDays: string[];
  /** Holiday days (weekdays + qualifying Saturdays on a ban) dropped from the count. */
  excludedDays: ExcludedDay[];
}

export interface KmCalcResult {
  /**
   * Sum of counted days across all months (rounded to 2 decimals) =
   * adjusted weekday days + qualifying Saturdays. `hoursAdjusted` reduces
   * only the weekday part; Saturdays are whole and untouched by the
   * correction.
   */
  totalDays: number;
  /**
   * Pre-adjustment total days (raw weekday days before `hoursAdjusted` +
   * qualifying Saturdays). Equals `totalDays` when no adjustment. Surfaced so
   * the UI can show both "surowych" (raw) and "zaliczonych" (after correction)
   * hours side-by-side per docs/14-design-system.md §Phase 3.1 "HoursReadout".
   * Same 2-dp rounding as totalDays.
   */
  rawTotalDays: number;
  /** Sum of `kmInMonth` across the breakdown (already rounded). */
  kmGuaranteed: number;
  /** Weighted EUR/km across months proportional to km share. Rounded to 3 decimals. */
  ratePerKmEffective: number;
  /** Per-month rows, sorted by `yearMonth`. */
  breakdown: MonthBreakdown[];
  /**
   * The claim period's first calendar day + the fraction of it actually credited
   * (0..1, 2-dp). 0 when that day was excluded (Sunday / EU-ban weekday /
   * non-qualifying or feature-off Saturday); 1 for a counted whole day or a
   * counted qualifying Saturday; the time-based fraction for a counted weekday.
   * This is the RAW credited fraction BEFORE the proportional `hoursAdjusted`
   * correction (that correction is a month-level downtime distribution, not a
   * per-day edit). `null` only when the date range is invalid/empty.
   */
  firstDay: { date: string; fraction: number } | null;
  /**
   * Symmetric: the period's last calendar day. For a single-day period,
   * `firstDay` and `lastDay` carry the SAME date + fraction.
   */
  lastDay: { date: string; fraction: number } | null;
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
): Required<MonthLimit> {
  const key = fmtYearMonth(year, monthZeroBased);
  const cfg = limits[key];
  return {
    kmPerDay: cfg && Number.isFinite(cfg.kmPerDay) ? cfg.kmPerDay : fallback.kmPerDay,
    ratePerKm: cfg && Number.isFinite(cfg.ratePerKm) ? cfg.ratePerKm : fallback.ratePerKm,
    // OPT-IN: `kmPerSaturday` falls back through cfg → fallback → 0. A missing
    // or non-finite value collapses to 0, which turns the feature OFF for the
    // month (Saturdays behave like ordinary weekends — legacy behavior).
    kmPerSaturday: resolveKmPerSaturday(cfg?.kmPerSaturday, fallback.kmPerSaturday),
  };
}

/** cfg → fallback → 0, dropping non-finite / negative values to 0. */
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
  /** Fractional WEEKDAY days (Mon–Fri). `hoursAdjusted` is applied to this. */
  rawDays: number;
  /** Whole qualifying ("odd") Saturdays credited this month (integer). */
  saturdaysCounted: number;
  /** ISO dates of the credited qualifying Saturdays (ascending walk order). */
  saturdayDays: string[];
  kmPerDay: number;
  ratePerKm: number;
  kmPerSaturday: number;
  excludedDays: ExcludedDay[];
}

/**
 * `1`-based ordinal of a day-of-month among same-weekday days: the 1st, 2nd,
 * … Saturday of the month. A Saturday "qualifies" (is credited) when its
 * ordinal is odd — i.e. the 1st, 3rd, or 5th Saturday. Purely positional
 * (`floor((dayOfMonth-1)/7)+1`), independent of the claim's start date, and
 * resets on the calendar-month boundary.
 */
function weekdayOrdinalInMonth(dayOfMonth: number): number {
  return Math.floor((dayOfMonth - 1) / 7) + 1;
}

/**
 * Walk every day of `[start, end]` (inclusive), accumulating fractional
 * weekday days AND qualifying-Saturday counts into `monthData`, keyed by
 * `YYYY-MM`.
 *
 * `weekdayRawTotal` sums only the Mon–Fri fractions (the `hoursAdjusted`
 * correction applies to this alone); `saturdayTotal` sums the whole qualifying
 * Saturdays. The reported raw/adjusted day totals are assembled by the caller
 * from these two parts.
 */
function accumulateMonthDays(
  start: ParsedDate,
  end: ParsedDate,
  hStart: number | null,
  hStop: number | null,
  limits: Record<string, MonthLimit>,
  fallback: MonthLimit,
  banDays: Map<string, string>,
): {
  monthData: Map<string, InternalMonthAcc>;
  weekdayRawTotal: number;
  saturdayTotal: number;
  firstDay: { date: string; fraction: number } | null;
  lastDay: { date: string; fraction: number } | null;
} {
  const monthData = new Map<string, InternalMonthAcc>();
  let weekdayRawTotal = 0;
  let saturdayTotal = 0;
  // Credited fraction of the period's boundary days, captured DURING the walk
  // so the number matches the calendar decision exactly (Sunday/ban → 0,
  // counted weekday → its time fraction, counted qualifying Saturday → 1).
  // These are the RAW credited fractions — `hoursAdjusted` (applied later) is a
  // month-level distribution and never rewrites an individual day.
  let firstDay: { date: string; fraction: number } | null = null;
  let lastDay: { date: string; fraction: number } | null = null;

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
        saturdaysCounted: 0,
        saturdayDays: [],
        kmPerDay: ml.kmPerDay,
        ratePerKm: ml.ratePerKm,
        kmPerSaturday: ml.kmPerSaturday,
        excludedDays: [],
      };
      monthData.set(monthKey, acc);
    }

    const banLabel = banDays.get(dateKey);

    // The exact km-credit weight the walk adds for THIS day. Stays 0 for every
    // excluded branch (Sunday / ban / non-qualifying or feature-off Saturday),
    // becomes the time fraction for a counted weekday, and 1 for a counted
    // qualifying Saturday. Surfaced for the boundary days below.
    let credited = 0;

    if (dow === 0) {
      // Sunday — always excluded, silently (legacy behavior, unchanged).
    } else if (dow === 6) {
      // Saturday — OPT-IN odd-Saturday guarantee.
      if (acc.kmPerSaturday > 0) {
        const ordinal = weekdayOrdinalInMonth(curD);
        const qualifies = ordinal % 2 === 1;
        if (qualifies) {
          if (banLabel !== undefined) {
            // Qualifying Saturday on a ban/holiday — not paid, not counted;
            // surfaced so the carrier sees WHY it didn't pay.
            acc.excludedDays.push({ date: dateKey, label: banLabel });
          } else {
            // Whole day — never fractioned by timeFrom/timeTo.
            acc.saturdaysCounted += 1;
            acc.saturdayDays.push(dateKey);
            saturdayTotal += 1;
            credited = 1;
          }
        }
        // Even/non-qualifying Saturday → skip silently.
      }
      // Feature OFF (kmPerSaturday <= 0) → skip silently (legacy behavior).
    } else {
      // Weekday (Mon–Fri).
      if (banLabel !== undefined) {
        acc.excludedDays.push({ date: dateKey, label: banLabel });
      } else {
        const fraction = fractionForDay({ isFirst, isLast, isSingle, hStart, hStop });
        acc.rawDays += fraction;
        weekdayRawTotal += fraction;
        credited = fraction;
      }
    }

    // Capture the credited fraction of the boundary days. For a single-day
    // period `isFirst` and `isLast` both hold, so both carry the same value.
    if (isFirst) firstDay = { date: dateKey, fraction: round2(credited) };
    if (isLast) lastDay = { date: dateKey, fraction: round2(credited) };

    cur.setDate(cur.getDate() + 1);
  }

  return { monthData, weekdayRawTotal, saturdayTotal, firstDay, lastDay };
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
      // Invalid/empty range → no boundary days to report.
      firstDay: null,
      lastDay: null,
    };
  }

  const hStart = parseHhMm(input.timeFrom ?? null);
  const hStop = parseHhMm(input.timeTo ?? null);

  // `includeSaturdays = true`: the map carries Saturday holidays so a
  // qualifying Saturday landing on a ban isn't paid. Weekday counting is
  // gated on `!weekend`, so the extra Saturday entries never affect it.
  const banDays = getEUBanDays(start.year, end.year, true);
  const { monthData, weekdayRawTotal, saturdayTotal, firstDay, lastDay } =
    accumulateMonthDays(
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

  // `hoursAdjusted` shrinks ONLY the weekday part (Saturdays are whole days,
  // untouched by the downtime correction). `applyHoursAdjustment` mutates
  // each acc's weekday `rawDays` in place and returns the adjusted weekday sum.
  const adjustedWeekdayTotal = applyHoursAdjustment(
    accs,
    weekdayRawTotal,
    input.hoursAdjusted ?? 0,
  );

  // Build breakdown + km totals + weighted rate.
  let kmGuaranteed = 0;
  let weightedRateSum = 0;
  const breakdown: MonthBreakdown[] = accs.map((a) => {
    const days = round2(a.rawDays);
    const kmWeekday = Math.round(days * a.kmPerDay);
    const kmFromSaturdays = Math.round(a.saturdaysCounted * a.kmPerSaturday);
    const kmInMonth = kmWeekday + kmFromSaturdays;
    kmGuaranteed += kmInMonth;
    // Weekdays and Saturdays share the month's `ratePerKm`, so the whole
    // month's km contributes at one rate — the weighted formula still holds.
    weightedRateSum += kmInMonth * a.ratePerKm;
    return {
      yearMonth: fmtYearMonth(a.year, a.monthZeroBased),
      workingDays: days,
      kmPerDay: a.kmPerDay,
      ratePerKm: a.ratePerKm,
      saturdaysCounted: a.saturdaysCounted,
      kmPerSaturday: a.kmPerSaturday,
      kmFromSaturdays,
      kmInMonth,
      saturdayDays: a.saturdayDays,
      excludedDays: a.excludedDays,
    };
  });

  // Weighted rate proportional to km share — matches Code.gs:937.
  const rawRate =
    kmGuaranteed > 0 ? weightedRateSum / kmGuaranteed : input.fallback.ratePerKm;
  const ratePerKmEffective = round3(rawRate);

  // Reported day totals fold the whole qualifying Saturdays back in on top of
  // the (adjusted) weekday days. Saturdays are never touched by `hoursAdjusted`.
  const totalDays = round2(adjustedWeekdayTotal + saturdayTotal);

  return {
    totalDays,
    // Pre-adjustment sum (raw weekday days + Saturdays), rounded to 2 dp —
    // matches `totalDays` when `hoursAdjusted` is 0 (the common case).
    rawTotalDays: round2(weekdayRawTotal + saturdayTotal),
    kmGuaranteed,
    ratePerKmEffective,
    breakdown,
    // Boundary-day credited fractions captured during the walk (RAW, pre
    // `hoursAdjusted`). Non-null for any valid range (a boundary day that was
    // excluded reports `fraction: 0`).
    firstDay,
    lastDay,
  };
}
