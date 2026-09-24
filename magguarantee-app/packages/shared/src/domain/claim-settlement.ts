// Claim settlement — turns a km-calc result + the kilometres actually driven
// into the numbers a wniosek is paid on (`kmDifference`, `paymentEur`).
//
// The guarantee is priced per calendar month, but the carrier declares ONE
// mileage for the whole outing. While every month of the period carries a
// weekday guarantee that is exactly what the payout needs:
//
//     kmDifference = kmGuaranteed − mileage
//
// Once an admin switches a month's weekday guarantee off (`kmPerDay = 0`,
// feature «wyłączane limity gwarancji», 2026-09-20) the declared figure is no
// longer usable: it still contains the kilometres driven in the switched-off
// month, and nothing in it says how many. Such a MIXED period is settled on the
// weryfikator's daily-km board instead (docs/20 §0⁵, 2026-09-24) — the same
// SpedTrans figures the carrier reads its own mileage from, recorded per day:
//
//     mileageEffective = Σ VehicleDailyKm.km (state = drove)
//                        over the days of [dateStart … dateEnd] that COUNT
//     kmDifference     = kmGuaranteed − mileageEffective
//     paymentEur       = kmDifference > 0 ? round2(kmDifference × ratePerKmEffective) : 0
//
// Which days count, per calendar month of the period (`SettlementMonthMode`):
//   - `active`        (`kmPerDay > 0`) — EVERY calendar day of month ∩ period:
//                     Sundays, EU-ban holidays, non-credited Saturdays, and the
//                     first / last day in full (`timeFrom` / `timeTo` shorten
//                     the GUARANTEE, not the kilometres). Same as a fully
//                     active period, where the carrier's sum covers every day;
//   - `saturdaysOnly` (`kmPerDay = 0`, `kmPerSaturday > 0`) — only the month's
//                     credited Saturdays (`saturdayDays`); its weekdays
//                     guarantee nothing, so their kilometres are not charged;
//   - `off`           (`kmPerDay = 0`, `kmPerSaturday = 0`) — nothing.
//
// A counted day without a board row is NEVER guessed: it contributes 0 km and
// is reported in `board.missingDates`. The api refuses to ACCEPT such a wniosek
// until the weryfikator fills the day in (422 `CLAIM_BOARD_INCOMPLETE`). An
// `idle` row is a filled day with 0 km; a `drove` row with `km = null` is 0 km.
//
// All-active periods return BEFORE the board is looked at, so their numbers are
// bit-identical to the pre-feature formula (`mileageEffective = mileage`).
//
// NOT handled here (deliberate, business decision):
//  - `Claim.drivenDays` / `Claim.kmPerDay` stay computed over the FULL period
//    from the declared mileage (they describe the outing, not the settlement);
//  - the `max_avg_km_per_day` sanity check stays on the RAW `mileage / totalDays`;
//  - the `canSubmitByDuration` (≥10 days) gate stays on `calc.totalDays`;
//  - fetching the board — the caller supplies the rows (the api reads them only
//    when `settlementNeedsBoard` says so).
//
// Pure functions, no IO, never throws — shared by the API (submit / verify /
// decision / recalc / preview) so every path prices a claim identically.

import type { MonthLimit } from './km-calc';

// ─── Types ───────────────────────────────────────────────

/**
 * The subset of a km-calc `MonthBreakdown` row the settlement needs. Declared
 * structurally (not as `Pick<MonthBreakdown, …>`) so a persisted legacy
 * `Claim.breakdown` JSONB row — which may lack the Saturday fields — is
 * accepted without a cast.
 */
export interface SettlementMonth {
  /** Daily km limit applied for the month. `0` ⇒ weekday guarantee OFF. */
  kmPerDay: number;
  /** Guarantee km per qualifying Saturday. Absent / `0` ⇒ Saturday feature OFF. */
  kmPerSaturday?: number;
  /** Counted WEEKDAY days of the month (already fraction- and korekta-adjusted). */
  workingDays: number;
  /** Counted qualifying ("odd") Saturdays. Absent on legacy rows ⇒ 0. */
  saturdaysCounted?: number;
  /**
   * `YYYY-MM` of the month — the key the board settlement classifies days by.
   * A row WITHOUT it (legacy input) cannot be placed on the calendar and is
   * treated as `active`: it never switches the settlement onto the board.
   */
  yearMonth?: string;
  /**
   * ISO dates of the month's CREDITED Saturdays (`MonthBreakdown.saturdayDays`).
   * The only days that count in a `saturdaysOnly` month. Absent ⇒ none.
   */
  saturdayDays?: readonly string[];
}

/** One weryfikator mark for `(vehicle, day)` — a `VehicleDailyKm` row. */
export interface BoardDay {
  /** ISO calendar date `YYYY-MM-DD`. */
  date: string;
  state: 'drove' | 'idle';
  /** km driven that day. `null` on `idle`; tolerated on `drove` (⇒ 0 km). */
  km: number | null;
}

export interface ClaimSettlementInput {
  /** Per-month rows from `calcKmGwarantPerMonth` (or a persisted breakdown). */
  breakdown: readonly SettlementMonth[];
  /** Mileage declared for the whole period (Decimal(10,2) on the row). */
  mileage: number;
  /** `KmCalcResult.kmGuaranteed` — already the sum over the breakdown. */
  kmGuaranteed: number;
  /** `KmCalcResult.ratePerKmEffective` — km-weighted EUR/km. */
  ratePerKmEffective: number;
  /** First day of the claim period, ISO `YYYY-MM-DD`, inclusive. */
  dateStart: string;
  /** Last day of the claim period, ISO `YYYY-MM-DD`, inclusive. */
  dateEnd: string;
  /**
   * The vehicle's board rows inside `[dateStart … dateEnd]`. `[]` when the
   * board is unavailable — then every counted day is reported missing (nothing
   * is guessed). Never read for an all-active period.
   */
  board: readonly BoardDay[];
}

/** How a calendar month of a mixed period contributes kilometres. */
export type SettlementMonthMode = 'active' | 'saturdaysOnly' | 'off';

/** Board settlement of ONE calendar month of the period. */
export interface SettlementBoardMonth {
  /** `YYYY-MM`. */
  yearMonth: string;
  mode: SettlementMonthMode;
  /** Σ `drove` km on the counted days of this month (0 for `off`). */
  km: number;
  /** Required days that have a row (`drove` OR `idle`). */
  daysFilled: number;
  /**
   * Days that must carry a row: every calendar day of month ∩ period for
   * `active`, the credited Saturdays for `saturdaysOnly`, none for `off`.
   */
  daysRequired: number;
  /** Required days without a row, ascending. */
  missingDates: string[];
}

export interface SettlementBoard {
  /** One entry per calendar month the period touches, ascending. */
  months: SettlementBoardMonth[];
  /** Every month's `missingDates`, concatenated (ascending). */
  missingDates: string[];
  /** `missingDates.length === 0`. */
  complete: boolean;
}

export interface ClaimSettlement {
  /** Counted days that fall on months whose guarantee is ON. */
  daysActive: number;
  /** Counted days over the whole period (≡ `KmCalcResult.totalDays`). */
  daysTotal: number;
  /**
   * The kilometres charged against the guarantee: the declared `mileage`
   * (`mileageSource === 'declared'`) or the board sum over the counted days
   * (`mileageSource === 'board'`).
   */
  mileageEffective: number;
  /** `kmGuaranteed − mileageEffective`; may be negative (no under-run). */
  kmDifference: number;
  /** Compensation in EUR, `0` when there is no under-run. */
  paymentEur: number;
  /** At least one month of the period has (part of) its guarantee switched off. */
  hasDisabledMonths: boolean;
  /** Where `mileageEffective` came from. */
  mileageSource: 'declared' | 'board';
  /** Per-month board detail. `null` ⇔ `mileageSource === 'declared'`. */
  board: SettlementBoard | null;
}

/** Shape of one persisted `Claim.breakdown.breakdown[]` row we can read. */
interface BreakdownSnapshotRow {
  yearMonth?: unknown;
  kmPerDay?: unknown;
  ratePerKm?: unknown;
  kmPerSaturday?: unknown;
}

/** Shape of the persisted `Claim.breakdown` JSONB envelope we can read. */
interface BreakdownSnapshotEnvelope {
  breakdown?: readonly BreakdownSnapshotRow[] | null;
}

// ─── Helpers ─────────────────────────────────────────────

/** Round to 2 decimals (same convention as the km-calc engine). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Non-finite / missing numbers collapse to 0 — a missing limit is not a guarantee. */
function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * A month guarantees SOMETHING — weekdays (`kmPerDay > 0`) or qualifying
 * Saturdays (`kmPerSaturday > 0`). Used for the `hasDisabledMonths` UI hint;
 * the day accounting itself is finer-grained (see `activeDaysOf`).
 */
export function isMonthActive(month: SettlementMonth): boolean {
  return num(month.kmPerDay) > 0 || num(month.kmPerSaturday) > 0;
}

/**
 * Classify a month by its limits: `active` (weekday guarantee on),
 * `saturdaysOnly` (only credited Saturdays guarantee anything) or `off`.
 * Looks at the limits only — the "row without `yearMonth` is active" rule
 * belongs to `settlementNeedsBoard` / the board walk.
 */
export function settlementMonthMode(month: SettlementMonth): SettlementMonthMode {
  if (num(month.kmPerDay) > 0) return 'active';
  return num(month.kmPerSaturday) > 0 ? 'saturdaysOnly' : 'off';
}

/**
 * `true` when the period must be settled on the board: at least one month
 * (identified by its `yearMonth`) has its weekday guarantee off
 * (`kmPerDay = 0`, with or without Saturdays). The api reads the board ONLY
 * when this holds.
 */
export function settlementNeedsBoard(
  breakdown: readonly SettlementMonth[],
): boolean {
  return breakdown.some(
    (month) =>
      typeof month.yearMonth === 'string' &&
      settlementMonthMode(month) !== 'active',
  );
}

/** Counted days of one month = weekday days + qualifying Saturdays. */
function daysOf(month: SettlementMonth): number {
  return num(month.workingDays) + num(month.saturdaysCounted);
}

/**
 * Counted days of one month that actually carry a guarantee: weekdays only
 * while `kmPerDay > 0`; qualifying Saturdays always (the engine credits them
 * exclusively when `kmPerSaturday > 0`).
 */
function activeDaysOf(month: SettlementMonth): number {
  const weekdays = num(month.kmPerDay) > 0 ? num(month.workingDays) : 0;
  return weekdays + num(month.saturdaysCounted);
}

/** `daysActive` / `daysTotal` / `hasDisabledMonths` — the day-count summary. */
function countDays(breakdown: readonly SettlementMonth[]): {
  daysActive: number;
  daysTotal: number;
  hasDisabledMonths: boolean;
} {
  let daysActiveRaw = 0;
  let daysTotalRaw = 0;
  let hasDisabledMonths = false;

  for (const month of breakdown) {
    const days = daysOf(month);
    const active = activeDaysOf(month);
    daysTotalRaw += days;
    daysActiveRaw += active;
    // Flag the month for the UI when part (or all) of it guarantees nothing:
    // either some of its counted days dropped out, or the whole month is off
    // (a fully-disabled month with zero counted days still deserves the hint).
    if (active < days || !isMonthActive(month)) {
      hasDisabledMonths = true;
    }
  }

  return {
    daysActive: round2(daysActiveRaw),
    daysTotal: round2(daysTotalRaw),
    hasDisabledMonths,
  };
}

/** The money part — one formula for both mileage sources. */
function price(
  input: ClaimSettlementInput,
  mileageEffective: number,
): Pick<ClaimSettlement, 'mileageEffective' | 'kmDifference' | 'paymentEur'> {
  const kmDifference = input.kmGuaranteed - mileageEffective;
  const paymentEur =
    kmDifference > 0 ? round2(kmDifference * input.ratePerKmEffective) : 0;
  return { mileageEffective, kmDifference, paymentEur };
}

// ─── Calendar walk (pure integer arithmetic, no `Date`) ──

interface Ymd {
  y: number;
  /** 1..12 */
  m: number;
  d: number;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

function parseYmd(s: string): Ymd | null {
  const match = ISO_DATE_RE.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

function nextYmd({ y, m, d }: Ymd): Ymd {
  if (d < daysInMonth(y, m)) return { y, m, d: d + 1 };
  if (m < 12) return { y, m: m + 1, d: 1 };
  return { y: y + 1, m: 1, d: 1 };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `YYYY-MM-DD` with a zero-padded 4-digit year, so the strings sort as dates. */
function fmtYmd({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** Every calendar day of `[dateStart … dateEnd]`; `[]` on an invalid/inverted range. */
function walkPeriod(dateStart: string, dateEnd: string): string[] {
  const start = parseYmd(dateStart);
  const end = parseYmd(dateEnd);
  if (!start || !end) return [];
  const endIso = fmtYmd(end);
  const out: string[] = [];
  for (let cur = start; fmtYmd(cur) <= endIso; cur = nextYmd(cur)) {
    out.push(fmtYmd(cur));
  }
  return out;
}

// ─── Board settlement ────────────────────────────────────

interface MonthRule {
  mode: SettlementMonthMode;
  /** Credited Saturdays — consulted only for `saturdaysOnly`. */
  saturdays: ReadonlySet<string>;
}

/** Months with no classifying row (legacy / unknown) are `active`. */
const ACTIVE_RULE: MonthRule = { mode: 'active', saturdays: new Set<string>() };

function buildMonthRules(
  breakdown: readonly SettlementMonth[],
): Map<string, MonthRule> {
  const rules = new Map<string, MonthRule>();
  for (const month of breakdown) {
    if (typeof month.yearMonth !== 'string') continue;
    rules.set(month.yearMonth, {
      mode: settlementMonthMode(month),
      saturdays: new Set(month.saturdayDays ?? []),
    });
  }
  return rules;
}

function indexBoard(board: readonly BoardDay[]): Map<string, BoardDay> {
  const rows = new Map<string, BoardDay>();
  for (const day of board) {
    if (typeof day.date !== 'string') continue;
    rows.set(day.date.slice(0, 10), day);
  }
  return rows;
}

function isCountedDay(rule: MonthRule, date: string): boolean {
  if (rule.mode === 'active') return true;
  if (rule.mode === 'saturdaysOnly') return rule.saturdays.has(date);
  return false; // 'off'
}

/** Walk the period day by day and settle every calendar month it touches. */
function settleBoard(input: ClaimSettlementInput): SettlementBoard {
  const rules = buildMonthRules(input.breakdown);
  const rows = indexBoard(input.board);
  const byMonth = new Map<string, SettlementBoardMonth>();
  const months: SettlementBoardMonth[] = [];

  for (const date of walkPeriod(input.dateStart, input.dateEnd)) {
    const yearMonth = date.slice(0, 7);
    const rule = rules.get(yearMonth) ?? ACTIVE_RULE;
    let month = byMonth.get(yearMonth);
    if (!month) {
      month = {
        yearMonth,
        mode: rule.mode,
        km: 0,
        daysFilled: 0,
        daysRequired: 0,
        missingDates: [],
      };
      byMonth.set(yearMonth, month);
      months.push(month);
    }
    if (!isCountedDay(rule, date)) continue;

    month.daysRequired += 1;
    const row = rows.get(date);
    if (row === undefined) {
      // Not checked by the weryfikator — reported, never guessed.
      month.missingDates.push(date);
      continue;
    }
    month.daysFilled += 1;
    if (row.state === 'drove') month.km += num(row.km);
  }

  const missingDates = months.flatMap((month) => month.missingDates);
  return { months, missingDates, complete: missingDates.length === 0 };
}

// ─── Public API ──────────────────────────────────────────

/**
 * Compute the settlement numbers for one wniosek. Pure; never throws.
 *
 *  - every month active (`!settlementNeedsBoard`) ⇒ `mileageEffective =
 *    mileage`, output bit-identical to the pre-feature formula, `board` is
 *    not even read;
 *  - mixed period ⇒ `mileageEffective = Σ board.months[].km` (board values
 *    as-is, no rounding); days without a row count 0 km and are listed in
 *    `board.missingDates`.
 */
export function settleClaim(input: ClaimSettlementInput): ClaimSettlement {
  const days = countDays(input.breakdown);

  if (!settlementNeedsBoard(input.breakdown)) {
    return {
      ...days,
      ...price(input, input.mileage),
      mileageSource: 'declared',
      board: null,
    };
  }

  const board = settleBoard(input);
  const boardKm = board.months.reduce((sum, month) => sum + month.km, 0);
  return {
    ...days,
    ...price(input, boardKm),
    mileageSource: 'board',
    board,
  };
}

/**
 * Rebuild a `'YYYY-MM' → MonthLimit` map from a persisted `Claim.breakdown`
 * JSONB envelope — the limits SNAPSHOT that was in force when the wniosek was
 * priced.
 *
 * Why: limits are editable retroactively (`PUT /limits/:yearMonth`), and a
 * wniosek already sitting in verification must NOT silently re-price itself
 * when an admin fixes next month's rate. Every recalc of an EXISTING wniosek
 * therefore feeds this snapshot back into km-calc (see
 * `KmCalcServiceInput.limitsSnapshot`); the explicit
 * `POST /claims/:nrZgl/recalc-limits` escape hatch is the only way to adopt
 * the live limits.
 *
 * Rules:
 *  - `null` / missing / malformed envelope ⇒ `{}` (no snapshot, live limits win);
 *  - a row needs a `YYYY-MM` key plus finite `kmPerDay` + `ratePerKm` to count;
 *  - `kmPerSaturday` is copied only when the row carries a finite number —
 *    legacy rows predate the field, and OMITTING the key lets the engine fold
 *    it to 0 (feature OFF), which is what those wnioski were priced with;
 *  - every other envelope key (`mileageSource`, the day counters, …) is
 *    ignored — only the per-month limits are a snapshot.
 */
export function limitsSnapshotFromBreakdown(
  envelope: BreakdownSnapshotEnvelope | null | undefined,
): Record<string, MonthLimit> {
  const out: Record<string, MonthLimit> = {};
  const rows = envelope?.breakdown;
  if (!Array.isArray(rows)) return out;

  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const key = row.yearMonth;
    if (typeof key !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(key)) {
      continue;
    }
    const kmPerDay = row.kmPerDay;
    const ratePerKm = row.ratePerKm;
    if (
      typeof kmPerDay !== 'number' ||
      !Number.isFinite(kmPerDay) ||
      typeof ratePerKm !== 'number' ||
      !Number.isFinite(ratePerKm)
    ) {
      continue;
    }
    const kmPerSaturday = row.kmPerSaturday;
    out[key] = {
      kmPerDay,
      ratePerKm,
      ...(typeof kmPerSaturday === 'number' && Number.isFinite(kmPerSaturday)
        ? { kmPerSaturday }
        : {}),
    };
  }
  return out;
}
