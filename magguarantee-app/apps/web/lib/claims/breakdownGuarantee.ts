// How the breakdown reads a month whose guarantee is switched off, and how it
// reads a MIXED period settled on the weryfikator's daily-km board (docs/14
// §16.5, docs/20 §0⁵).
//
// Month state — derived ENTIRELY from fields the breakdown already carries:
//   disabled     — `kmPerDay === 0 && kmPerSaturday === 0` → nothing is paid
//   saturdayOnly — `kmPerDay === 0 && kmFromSaturdays > 0` → weekdays off,
//                  Saturdays still pay (the row is NOT muted: it pays)
//
// Period state:
//   allDisabled  — every row `disabled` (from the rows, as before) → EmptyState
//   boardSettled — `breakdown.mileageSource === 'board'`, the SERVER flag. It is
//                  NEVER re-derived from the rows: the one old proportional
//                  wniosek has mixed rows but no `mileageSource`, and any of the
//                  new notices would be untrue for it (§16.5.1). Absent ⇒
//                  `'declared'`.
//
// Board detail (staff only) — `ClaimBoardSettlement` is joined to the breakdown
// rows by `yearMonth` and turned into a per-month cell descriptor, so the table
// and the card variant render from the same decision.
//
// Runtime note: `KmCalcBreakdown` is a Zod-INFERRED type, but the web client
// does not re-parse API responses — a legacy `Claim.breakdown` really can
// arrive without optional keys at runtime even where TypeScript says `number`.
// Numeric reads go through `finite()` for that reason.
//
// Pure, framework-free, unit-tested (`breakdownGuarantee.test.ts`).

import type {
  ClaimBoardSettlement,
  KmCalcBreakdown,
  MonthBreakdownDto,
  SettlementBoardMonthDto,
} from '@magguarantee/shared';

function finite(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// ── Month flags ──────────────────────────────────────────────────────

export function isMonthGuaranteeDisabled(row: MonthBreakdownDto): boolean {
  return (finite(row.kmPerDay) ?? 0) === 0 && (finite(row.kmPerSaturday) ?? 0) === 0;
}

export function isMonthSaturdayOnly(row: MonthBreakdownDto): boolean {
  return (
    (finite(row.kmPerDay) ?? 0) === 0 && (finite(row.kmFromSaturdays) ?? 0) > 0
  );
}

/**
 * The month's WEEKDAY guarantee is off (`kmPerDay === 0`), with or without
 * Saturdays. Exactly the months that switch a period onto the board
 * (`settlementNeedsBoard` in `@magguarantee/shared`), so a board-settled
 * period always has at least one.
 */
export function isMonthWeekdayGuaranteeOff(row: MonthBreakdownDto): boolean {
  return (finite(row.kmPerDay) ?? 0) === 0;
}

/**
 * The rate is meaningless without kilometres: when nothing is guaranteed the
 * engine still reports the global 0,50 €/km fallback, and printing it next to
 * "0 km" reads as a promise. Everywhere `kmGuaranteed === 0` the rate renders
 * as «—» (§16.5.2, locked).
 */
export function isGhostRate(kmGuaranteed: number | null | undefined): boolean {
  return (finite(kmGuaranteed) ?? 0) === 0;
}

// ── Period ───────────────────────────────────────────────────────────

/** The server's mixed-period flag. Absent (legacy / all-active) ⇒ `false`. */
export function isBoardSettled(
  breakdown: Pick<KmCalcBreakdown, 'mileageSource'> | null | undefined,
): boolean {
  return breakdown?.mileageSource === 'board';
}

export interface BreakdownGuaranteeInfo {
  /**
   * Months whose weekday guarantee is off (fully off or Saturdays-only) — the
   * `count` of the mixed-period notice. Never 0 on a board-settled period.
   */
  offMonthCount: number;
  /** Every month of the period is off → `<EmptyState>` instead of zero rows. */
  allDisabled: boolean;
  /** `mileageSource === 'board'` — the server says the period is mixed. */
  boardSettled: boolean;
  /** Mixed-period notice ABOVE the table: board-settled and not all-off. */
  showMixedNotice: boolean;
}

export function analyzeBreakdown(
  breakdown: KmCalcBreakdown,
): BreakdownGuaranteeInfo {
  const rows = breakdown.breakdown ?? [];
  let disabledCount = 0;
  let offMonthCount = 0;

  for (const row of rows) {
    if (isMonthGuaranteeDisabled(row)) disabledCount += 1;
    if (isMonthWeekdayGuaranteeOff(row)) offMonthCount += 1;
  }

  const allDisabled = rows.length > 0 && disabledCount === rows.length;
  const boardSettled = isBoardSettled(breakdown);

  return {
    offMonthCount,
    allDisabled,
    boardSettled,
    showMixedNotice: boardSettled && !allDisabled,
  };
}

// ── Board settlement (staff) ─────────────────────────────────────────

/** `true` only for a board settlement that says a counted day is missing. */
export function isBoardIncomplete(
  board: ClaimBoardSettlement | null | undefined,
): boolean {
  return board != null && board.complete === false;
}

/**
 * The «Razem» of the staff «Km wg weryfikatora» column: the LIVE board total
 * (`boardSettlement.mileageEffective` = Σ of the months' board km), i.e. the
 * same source as the rows above it, so the column always adds up. NOT
 * `breakdown.mileageEffective` — that is the km the claim was last PRICED on
 * (submit / verification / decision) and goes stale as soon as the weryfikator
 * fills a day. `null` without a board (the cell then renders «—»).
 */
export function boardColumnTotalKm(
  board: ClaimBoardSettlement | null | undefined,
): number | null {
  return finite(board?.mileageEffective);
}

/** `yearMonth` → board month, for joining onto the breakdown rows. */
export function boardMonthIndex(
  board: ClaimBoardSettlement | null | undefined,
): Map<string, SettlementBoardMonthDto> {
  const out = new Map<string, SettlementBoardMonthDto>();
  for (const month of board?.months ?? []) out.set(month.yearMonth, month);
  return out;
}

/** A board month that has something to show. */
export interface BoardValueCell {
  kind: 'value';
  /** Σ `drove` km on the counted days. */
  km: number;
  daysFilled: number;
  daysRequired: number;
  /** Required days are Saturdays — the value is labelled «X z Y sob.». */
  saturdaysOnly: boolean;
  /** `daysRequired − daysFilled`, never negative. `> 0` ⇒ amber + sr-only. */
  missing: number;
}

/**
 * What the two staff board cells of one month render (§16.5.5):
 *  - `off`   — guarantee off this month: «—» (+ `boardOffTitle`); the card
 *              variant drops the block entirely;
 *  - `none`  — no board month to pair with, or nothing required: plain «—»;
 *  - `value` — board km + «filled z required».
 */
export type BoardCell = { kind: 'off' } | { kind: 'none' } | BoardValueCell;

export function boardCell(month: SettlementBoardMonthDto | undefined): BoardCell {
  if (!month) return { kind: 'none' };
  if (month.mode === 'off') return { kind: 'off' };
  const daysRequired = finite(month.daysRequired) ?? 0;
  if (daysRequired === 0) return { kind: 'none' };
  const daysFilled = finite(month.daysFilled) ?? 0;
  return {
    kind: 'value',
    km: finite(month.km) ?? 0,
    daysFilled,
    daysRequired,
    saturdaysOnly: month.mode === 'saturdaysOnly',
    missing: Math.max(0, daysRequired - daysFilled),
  };
}

// ── «Brak danych» notice (ClaimModal, §16.5.6) ───────────────────────

/** Up to this many dates the list is shown in full. */
export const MISSING_DATES_SHOW_ALL_MAX = 8;
/** Above the threshold, the collapsed list shows this many. */
export const MISSING_DATES_COLLAPSED = 6;

/** ISO `YYYY-MM-DD` strings sort chronologically as plain strings. */
export function sortMissingDates(dates: readonly string[]): string[] {
  return [...dates].sort();
}

/** Whether the list needs the «Pokaż wszystkie (N)» toggle at all. */
export function isMissingDatesCollapsible(count: number): boolean {
  return count > MISSING_DATES_SHOW_ALL_MAX;
}

export function visibleMissingDates(
  sorted: readonly string[],
  expanded: boolean,
): string[] {
  if (expanded || !isMissingDatesCollapsible(sorted.length)) return [...sorted];
  return sorted.slice(0, MISSING_DATES_COLLAPSED);
}

/**
 * The last day of the period is among the missing ones — the usual reason is
 * that the board cannot take today's day (`returnDayHint`). `dateEnd` may be a
 * full ISO datetime; only its calendar day counts.
 */
export function missesLastDay(
  missing: readonly string[],
  dateEnd: string | null | undefined,
): boolean {
  if (!dateEnd) return false;
  return missing.includes(dateEnd.slice(0, 10));
}

/**
 * `2025-09-18` → «czw., 18.09.2025» (pl) / «Thu, 18/09/2025» (en). Parsed as a
 * LOCAL date (`new Date(y, m − 1, d)`) — never through UTC, which would shift
 * the day west of Greenwich. The year is always printed: a period can cross
 * New Year.
 */
export function formatBoardDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}
