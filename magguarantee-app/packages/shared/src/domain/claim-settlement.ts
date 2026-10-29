// Claim settlement — turns a km-calc result + the kilometres actually driven
// into the numbers a wniosek is paid on (`kmDifference`, `paymentEur`).
//
// The guarantee is priced per ISO WEEK (since 2026-10-29; per calendar month
// before), but the carrier declares ONE mileage for the whole outing. While
// every week of the period carries a weekday guarantee that is exactly what the
// payout needs:
//
//     kmDifference = kmGuaranteed − mileage
//
// Once an admin switches a week's weekday guarantee off (`kmPerDay = 0`,
// feature «wyłączane limity gwarancji», 2026-09-20) the declared figure is no
// longer usable: it still contains the kilometres driven in the switched-off
// week, and nothing in it says how many. Such a MIXED period is settled on the
// weryfikator's daily-km board instead (docs/20 §0⁵) — the same SpedTrans
// figures the carrier reads its own mileage from, recorded per day
// (docs/01-overview.md §«Расчёт доплаты»):
//
//     mileageEffective = Σ VehicleDailyKm.km (state = drove)
//                        over the days of [dateStart … dateEnd] that COUNT
//     kmDifference     = kmGuaranteed − mileageEffective
//     paymentEur       = kmDifference > 0 ? round2(kmDifference × ratePerKmEffective) : 0
//
// Which days count, per ISO week of the period (`SettlementWeekMode`):
//   - `active`        (`kmPerDay > 0`) — EVERY calendar day of week ∩ period:
//                     Sunday, EU-ban holidays, a non-credited Saturday, and the
//                     first / last day in full (`timeFrom` / `timeTo` shorten
//                     the GUARANTEE, not the kilometres);
//   - `saturdaysOnly` (`kmPerDay = 0`, `kmPerSaturday > 0`) — only the week's
//                     credited Saturday (`saturdayDays`); its weekdays guarantee
//                     nothing, so their kilometres are not charged;
//   - `off`           (`kmPerDay = 0`, `kmPerSaturday = 0`) — nothing.
//
// A counted day without a board row is NEVER guessed: it contributes 0 km and
// is reported in `board.missingDates`. The api refuses to ACCEPT such a wniosek
// until the weryfikator fills the day in (422 `CLAIM_BOARD_INCOMPLETE`). An
// `idle` row is a filled day with 0 km; a `drove` row with `km = null` is 0 km.
//
// All-active periods return BEFORE the board is looked at, so their numbers are
// bit-identical to the plain formula (`mileageEffective = mileage`).
//
// NOT handled here (deliberate, business decision):
//  - `Claim.drivenDays` / `Claim.kmPerDay` stay computed over the FULL period
//    from the declared mileage (they describe the outing, not the settlement);
//  - the `max_avg_km_per_day` sanity check stays on the RAW `mileage / totalDays`;
//  - the `canSubmitByDuration` (≥10 days) gate stays on `calc.totalDays`;
//  - fetching the board — the caller supplies the rows (the api reads them only
//    when `settlementNeedsBoard` says so).
//
// Pure functions, no IO, never throws, TIME-ZONE INDEPENDENT (the calendar is
// walked on integer day numbers) — shared by the API (submit / verify /
// decision / recalc / preview) so every path prices a claim identically.

import {
  dayNumberFromIso,
  formatIsoWeekKeyRaw,
  isoFromDayNumber,
  isoWeekOfDayNumber,
} from './civil-date';
import { parseIsoWeekKey } from './iso-week';
import type { WeekLimit } from './km-calc';

// ─── Types ───────────────────────────────────────────────

/**
 * The subset of a km-calc `WeekBreakdown` row the settlement needs. Declared
 * structurally so both the engine row and the parsed wire row
 * (`WeekBreakdownDto`) are accepted without a cast.
 */
export interface SettlementWeek {
  /** `YYYY-Www` — the key the board walk classifies days by. */
  isoWeek: string;
  /** Daily km limit applied for the week. `0` ⇒ weekday guarantee OFF. */
  kmPerDay: number;
  /** km for the week's Saturday. `0` ⇒ the week has no Saturday guarantee. */
  kmPerSaturday: number;
  /** Counted WEEKDAY days of the week (already fraction- and korekta-adjusted). */
  workingDays: number;
  /** `1` when the week's Saturday was credited, else `0`. */
  saturdaysCounted: number;
  /** The credited Saturday (`[]` when none) — the only day of a `saturdaysOnly` week. */
  saturdayDays: readonly string[];
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
  /** Per-week rows from `calcKmGwarant` (or a persisted breakdown). */
  breakdown: readonly SettlementWeek[];
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

/** How an ISO week of a mixed period contributes kilometres. */
export type SettlementWeekMode = 'active' | 'saturdaysOnly' | 'off';

/** Board settlement of ONE ISO week of the period. */
export interface SettlementBoardWeek {
  /** `YYYY-Www`. */
  isoWeek: string;
  mode: SettlementWeekMode;
  /** Σ `drove` km on the counted days of this week (0 for `off`). */
  km: number;
  /** Required days that have a row (`drove` OR `idle`). */
  daysFilled: number;
  /**
   * Days that must carry a row: every calendar day of week ∩ period for
   * `active`, the credited Saturday for `saturdaysOnly`, none for `off`.
   */
  daysRequired: number;
  /** Required days without a row, ascending. */
  missingDates: string[];
}

export interface SettlementBoard {
  /** One entry per ISO week the period touches, ascending. */
  weeks: SettlementBoardWeek[];
  /** Every week's `missingDates`, concatenated (ascending). */
  missingDates: string[];
  /** `missingDates.length === 0`. */
  complete: boolean;
}

export interface ClaimSettlement {
  /** Counted days that carry a guarantee (weekdays of `kmPerDay > 0` weeks + credited Saturdays). */
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
  /** At least one week of the period has (part of) its guarantee switched off. */
  hasDisabledWeeks: boolean;
  /** Where `mileageEffective` came from. */
  mileageSource: 'declared' | 'board';
  /** Per-week board detail. `null` ⇔ `mileageSource === 'declared'`. */
  board: SettlementBoard | null;
}

/** Shape of one persisted `Claim.breakdown.breakdown[]` row we can read. */
interface BreakdownSnapshotRow {
  isoWeek?: unknown;
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
 * A week guarantees SOMETHING — weekdays (`kmPerDay > 0`) or its Saturday
 * (`kmPerSaturday > 0`). Used for the `hasDisabledWeeks` UI hint; the day
 * accounting itself is finer-grained (see `activeDaysOf`).
 */
export function isWeekActive(week: Pick<SettlementWeek, 'kmPerDay' | 'kmPerSaturday'>): boolean {
  return num(week.kmPerDay) > 0 || num(week.kmPerSaturday) > 0;
}

/**
 * Classify a week by its limits: `active` (weekday guarantee on),
 * `saturdaysOnly` (only its credited Saturday guarantees anything) or `off`.
 */
export function settlementWeekMode(
  week: Pick<SettlementWeek, 'kmPerDay' | 'kmPerSaturday'>,
): SettlementWeekMode {
  if (num(week.kmPerDay) > 0) return 'active';
  return num(week.kmPerSaturday) > 0 ? 'saturdaysOnly' : 'off';
}

/**
 * `true` when the period must be settled on the board: at least one week has
 * its weekday guarantee off (`kmPerDay = 0`, with or without its Saturday).
 * The api reads the board ONLY when this holds.
 */
export function settlementNeedsBoard(breakdown: readonly SettlementWeek[]): boolean {
  return breakdown.some((week) => settlementWeekMode(week) !== 'active');
}

/** Counted days of one week = weekday days + the credited Saturday. */
function daysOf(week: SettlementWeek): number {
  return num(week.workingDays) + num(week.saturdaysCounted);
}

/**
 * Counted days of one week that actually carry a guarantee: weekdays only
 * while `kmPerDay > 0`; a credited Saturday always (the engine credits it
 * exclusively when `kmPerSaturday > 0`).
 */
function activeDaysOf(week: SettlementWeek): number {
  const weekdays = num(week.kmPerDay) > 0 ? num(week.workingDays) : 0;
  return weekdays + num(week.saturdaysCounted);
}

/** `daysActive` / `daysTotal` / `hasDisabledWeeks` — the day-count summary. */
function countDays(breakdown: readonly SettlementWeek[]): {
  daysActive: number;
  daysTotal: number;
  hasDisabledWeeks: boolean;
} {
  let daysActiveRaw = 0;
  let daysTotalRaw = 0;
  let hasDisabledWeeks = false;

  for (const week of breakdown) {
    const days = daysOf(week);
    const active = activeDaysOf(week);
    daysTotalRaw += days;
    daysActiveRaw += active;
    // Flag the week for the UI when part (or all) of it guarantees nothing:
    // either some of its counted days dropped out, or the whole week is off
    // (a fully-disabled week with zero counted days still deserves the hint).
    if (active < days || !isWeekActive(week)) hasDisabledWeeks = true;
  }

  return {
    daysActive: round2(daysActiveRaw),
    daysTotal: round2(daysTotalRaw),
    hasDisabledWeeks,
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

// ─── Board settlement ────────────────────────────────────

interface WeekRule {
  mode: SettlementWeekMode;
  /** The credited Saturday — consulted only for `saturdaysOnly`. */
  saturdays: ReadonlySet<string>;
}

/**
 * A week of the period without a breakdown row is `active` — conservative:
 * its kilometres are charged. Never happens for a breakdown the engine built
 * over the same period (it emits a row for every week it touches).
 */
const ACTIVE_RULE: WeekRule = { mode: 'active', saturdays: new Set<string>() };

function buildWeekRules(breakdown: readonly SettlementWeek[]): Map<string, WeekRule> {
  const rules = new Map<string, WeekRule>();
  for (const week of breakdown) {
    rules.set(week.isoWeek, {
      mode: settlementWeekMode(week),
      saturdays: new Set(week.saturdayDays),
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

function isCountedDay(rule: WeekRule, date: string): boolean {
  if (rule.mode === 'active') return true;
  if (rule.mode === 'saturdaysOnly') return rule.saturdays.has(date);
  return false; // 'off'
}

/** Walk the period day by day and settle every ISO week it touches. */
function settleBoard(input: ClaimSettlementInput): SettlementBoard {
  const rules = buildWeekRules(input.breakdown);
  const rows = indexBoard(input.board);
  const weeks: SettlementBoardWeek[] = [];
  const startDay = dayNumberFromIso(input.dateStart);
  const endDay = dayNumberFromIso(input.dateEnd);

  if (startDay !== null && endDay !== null) {
    let current: SettlementBoardWeek | undefined;
    let rule: WeekRule = ACTIVE_RULE;
    for (let day = startDay; day <= endDay; day += 1) {
      const { isoYear, isoWeek } = isoWeekOfDayNumber(day);
      const key = formatIsoWeekKeyRaw(isoYear, isoWeek);
      if (current === undefined || current.isoWeek !== key) {
        rule = rules.get(key) ?? ACTIVE_RULE;
        current = {
          isoWeek: key,
          mode: rule.mode,
          km: 0,
          daysFilled: 0,
          daysRequired: 0,
          missingDates: [],
        };
        weeks.push(current);
      }
      const date = isoFromDayNumber(day);
      if (!isCountedDay(rule, date)) continue;

      current.daysRequired += 1;
      const row = rows.get(date);
      if (row === undefined) {
        current.missingDates.push(date); // not checked by the weryfikator — never guessed
        continue;
      }
      current.daysFilled += 1;
      if (row.state === 'drove') current.km += num(row.km);
    }
  }

  const missingDates = weeks.flatMap((week) => week.missingDates);
  return { weeks, missingDates, complete: missingDates.length === 0 };
}

// ─── Public API ──────────────────────────────────────────

/**
 * Compute the settlement numbers for one wniosek. Pure; never throws.
 *
 *  - every week active (`!settlementNeedsBoard`) ⇒ `mileageEffective =
 *    mileage`, output bit-identical to the plain formula, `board` is not even
 *    read;
 *  - mixed period ⇒ `mileageEffective = Σ board.weeks[].km` (board values
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
  const boardKm = board.weeks.reduce((sum, week) => sum + week.km, 0);
  return {
    ...days,
    ...price(input, boardKm),
    mileageSource: 'board',
    board,
  };
}

/**
 * Rebuild a `'YYYY-Www' → WeekLimit` map from a persisted `Claim.breakdown`
 * JSONB envelope — the limits SNAPSHOT that was in force when the wniosek was
 * priced (docs/01-overview.md «Заморозка лимитов»).
 *
 * Why: limits are editable retroactively (`PUT /limits/:isoWeek`), and a
 * wniosek already sitting in verification must NOT silently re-price itself
 * when an admin fixes next week's rate. Every recalc of an EXISTING wniosek
 * therefore feeds this snapshot back into km-calc; the explicit
 * `POST /claims/:nrZgl/recalc-limits` escape hatch is the only way to adopt
 * the live limits.
 *
 * Rules:
 *  - `null` / missing / malformed envelope ⇒ `{}` (no snapshot, live limits win);
 *  - a row needs a valid `YYYY-Www` key (a week the year has) plus finite
 *    `kmPerDay` + `ratePerKm` to count — anything else (incl. a monthly
 *    `yearMonth` row) is skipped;
 *  - `kmPerSaturday` is copied only when it is a finite number; omitting it
 *    lets the engine fold it to the Saturday fallback (0);
 *  - every other envelope key (`mileageSource`, the day counters, …) is
 *    ignored — only the per-week limits are a snapshot.
 */
export function limitsSnapshotFromBreakdown(
  envelope: BreakdownSnapshotEnvelope | null | undefined,
): Record<string, WeekLimit> {
  const out: Record<string, WeekLimit> = {};
  const rows = envelope?.breakdown;
  if (!Array.isArray(rows)) return out;

  for (const row of rows as readonly unknown[]) {
    if (row === null || typeof row !== 'object') continue;
    const { isoWeek, kmPerDay, ratePerKm, kmPerSaturday } = row as BreakdownSnapshotRow;
    if (typeof isoWeek !== 'string' || parseIsoWeekKey(isoWeek) === null) continue;
    if (
      typeof kmPerDay !== 'number' ||
      !Number.isFinite(kmPerDay) ||
      typeof ratePerKm !== 'number' ||
      !Number.isFinite(ratePerKm)
    ) {
      continue;
    }
    out[isoWeek] = {
      kmPerDay,
      ratePerKm,
      ...(typeof kmPerSaturday === 'number' && Number.isFinite(kmPerSaturday)
        ? { kmPerSaturday }
        : {}),
    };
  }
  return out;
}
