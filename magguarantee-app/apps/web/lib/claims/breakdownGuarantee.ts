// How the breakdown reads an ISO week whose guarantee is switched off, its
// Saturday, and a MIXED period settled on the weryfikator's daily-km board
// (docs/14 §16.5, §18.7; docs/20 §0⁵). One row of the breakdown = one ISO week
// of the claim period (since 2026-10-29).
//
// Week state — derived ENTIRELY from fields the row already carries (§16.5.1):
//   disabled     — `kmPerDay === 0 && kmPerSaturday === 0` → nothing is paid
//   saturdayOnly — `kmPerDay === 0 && kmPerSaturday > 0`  → weekdays off, the
//                  Saturday is guaranteed (badged even when that Saturday was
//                  not credited — the «Sob.» cell then shows `0`; the row is
//                  NOT muted)
//   active       — otherwise, no marking
//
// Saturday cell («Sob.», §18.7.1) — the shared `weekSaturdayStatus`:
//   counted    — the week's Saturday was credited → its km;
//   notCounted — the week has a Saturday guarantee but its Saturday was not
//                credited (outside the claim period, or an excluded day) → `0`;
//   none       — the week has no Saturday guarantee → «—».
//
// Period state:
//   allDisabled  — every row `disabled` → EmptyState instead of zero rows
//   boardSettled — `breakdown.mileageSource === 'board'`, the SERVER flag. It is
//                  NEVER re-derived from the rows (§16.5.1); absent ⇒
//                  `'declared'`.
//
// Board detail (staff only) — `ClaimBoardSettlement.weeks` is joined to the
// breakdown rows by `isoWeek` and turned into a per-week cell descriptor, so
// the table and the collapsed-row variant render from the same decision.
//
// Runtime note: `KmCalcBreakdown` is a Zod-INFERRED type, but the web client
// does not re-parse API responses, so numeric reads go through `finite()` —
// a half-built preview must not render NaN.
//
// Pure, framework-free, unit-tested (`breakdownGuarantee.test.ts`).

import {
  weekSaturdayStatus,
  type ClaimBoardSettlement,
  type KmCalcBreakdown,
  type SettlementBoardWeekDto,
  type WeekBreakdownDto,
  type WeekSaturdayStatus,
} from '@magguarantee/shared';

function finite(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// ── Week flags ───────────────────────────────────────────────────────

type WeekLimitFields = Pick<WeekBreakdownDto, 'kmPerDay' | 'kmPerSaturday'>;

/** Neither the weekdays nor the Saturday of the week carry a guarantee. */
export function isWeekGuaranteeDisabled(row: WeekLimitFields): boolean {
  return (finite(row.kmPerDay) ?? 0) === 0 && (finite(row.kmPerSaturday) ?? 0) === 0;
}

/**
 * Weekdays off, the Saturday guaranteed. Keyed on the LIMIT (`kmPerSaturday >
 * 0`), not on whether the Saturday was credited: a week whose guaranteed
 * Saturday falls outside the period is still «Tylko sobota» — the «Sob.»
 * column shows the `0` (§16.5.1).
 */
export function isWeekSaturdayOnly(row: WeekLimitFields): boolean {
  return (finite(row.kmPerDay) ?? 0) === 0 && (finite(row.kmPerSaturday) ?? 0) > 0;
}

/**
 * The week's WEEKDAY guarantee is off (`kmPerDay === 0`), with or without its
 * Saturday. Exactly the weeks that switch a period onto the board
 * (`settlementNeedsBoard` in `@magguarantee/shared`), so a board-settled
 * period always has at least one.
 */
export function isWeekdayGuaranteeOff(row: Pick<WeekBreakdownDto, 'kmPerDay'>): boolean {
  return (finite(row.kmPerDay) ?? 0) === 0;
}

export type WeekGuaranteeMode = 'disabled' | 'saturdayOnly' | 'active';

/** The one marking a row gets (badge + muting), §16.5.2. */
export function weekGuaranteeMode(row: WeekLimitFields): WeekGuaranteeMode {
  if (isWeekGuaranteeDisabled(row)) return 'disabled';
  if (isWeekSaturdayOnly(row)) return 'saturdayOnly';
  return 'active';
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

// ── Saturday cell ────────────────────────────────────────────────────

export interface SaturdayCell {
  status: WeekSaturdayStatus;
  /** km credited for the Saturday — `0` unless `counted`. */
  km: number;
}

/** What the «Sob.» cell of one week shows (§18.7.1). */
export function saturdayCell(
  row: Pick<WeekBreakdownDto, 'kmPerSaturday' | 'saturdaysCounted' | 'kmFromSaturdays'>,
): SaturdayCell {
  const status = weekSaturdayStatus({
    kmPerSaturday: finite(row.kmPerSaturday) ?? 0,
    saturdaysCounted: finite(row.saturdaysCounted) ?? 0,
  });
  return {
    status,
    km: status === 'counted' ? (finite(row.kmFromSaturdays) ?? 0) : 0,
  };
}

// ── Period ───────────────────────────────────────────────────────────

/** The server's mixed-period flag. Absent ⇒ `'declared'` ⇒ `false`. */
export function isBoardSettled(
  breakdown: Pick<KmCalcBreakdown, 'mileageSource'> | null | undefined,
): boolean {
  return breakdown?.mileageSource === 'board';
}

export interface BreakdownGuaranteeInfo {
  /**
   * Weeks whose weekday guarantee is off (fully off or Saturday-only) — the
   * `count` of the mixed-period notice. Never 0 on a board-settled period.
   */
  offWeekCount: number;
  /** Every week of the period is off → `<EmptyState>` instead of zero rows. */
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
  let offWeekCount = 0;

  for (const row of rows) {
    if (isWeekGuaranteeDisabled(row)) disabledCount += 1;
    if (isWeekdayGuaranteeOff(row)) offWeekCount += 1;
  }

  const allDisabled = rows.length > 0 && disabledCount === rows.length;
  const boardSettled = isBoardSettled(breakdown);

  return {
    offWeekCount,
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
 * (`boardSettlement.mileageEffective` = Σ of the weeks' board km), i.e. the
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

/** `isoWeek` → board week, for joining onto the breakdown rows. */
export function boardWeekIndex(
  board: ClaimBoardSettlement | null | undefined,
): Map<string, SettlementBoardWeekDto> {
  const out = new Map<string, SettlementBoardWeekDto>();
  for (const week of board?.weeks ?? []) out.set(week.isoWeek, week);
  return out;
}

/** A board week that has something to show. */
export interface BoardValueCell {
  kind: 'value';
  /** Σ `drove` km on the counted days. */
  km: number;
  daysFilled: number;
  daysRequired: number;
  /** The required day is the week's Saturday — the value reads «1 z 1 sob.». */
  saturdaysOnly: boolean;
  /** `daysRequired − daysFilled`, never negative. `> 0` ⇒ amber + sr-only. */
  missing: number;
}

/**
 * What the two staff board cells of one week render (§16.5.5, §18.7.2):
 *  - `off`   — guarantee off this week: «—» (+ `boardOffTitle`); the
 *              collapsed-row variant drops the block entirely;
 *  - `none`  — no board week to pair with, or nothing required: plain «—»;
 *  - `value` — board km + «filled z required».
 */
export type BoardCell = { kind: 'off' } | { kind: 'none' } | BoardValueCell;

export function boardCell(week: SettlementBoardWeekDto | undefined): BoardCell {
  if (!week) return { kind: 'none' };
  if (week.mode === 'off') return { kind: 'off' };
  const daysRequired = finite(week.daysRequired) ?? 0;
  if (daysRequired === 0) return { kind: 'none' };
  const daysFilled = finite(week.daysFilled) ?? 0;
  return {
    kind: 'value',
    km: finite(week.km) ?? 0,
    daysFilled,
    daysRequired,
    saturdaysOnly: week.mode === 'saturdaysOnly',
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
