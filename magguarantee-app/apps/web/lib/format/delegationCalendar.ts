// Window math for <DelegationKmCalendar> (docs/14-design-system.md §7.7).
//
// The km-calendar strip spans from the outing's departure day to the *real*
// trip end. Historically it always stopped at `plannedReturnAt`, which HID the
// `VehicleDailyKm` rows that exist for days when the carrier returned LATER
// than planned (zjechał late, or still w_trasie past the plan). This module
// derives the correct window so those days render.
//
// Two ranges, deliberately separate (chicken-and-egg: we need the rows to know
// the last real km day, but we need a `to` to fetch the rows):
//
//   FETCH range — broad, computed BEFORE rows exist; an upper bound that is
//     guaranteed to include every existing km row (km are entered only for
//     strictly-past days, so business-`today` is a safe ceiling for an open
//     trip). Used only as the `to` passed to `useVehicleDailyKmHistory`.
//
//   RENDER range — narrow, data-driven; clamps the empty tail so a long open
//     trip with sparse km doesn't paint weeks of empty tiles past the last
//     real day. This is what the strip actually draws.
//
// All comparisons are on `YYYY-MM-DD` strings — ISO lexical order is calendar
// order, so no Date arithmetic is needed here. The one zone-aware step is the
// start day (`delegationStartDay` below): the reported `departureAt` is a
// TRUE UTC instant reduced to its Warsaw calendar date, while every other
// field is date-only or Warsaw wall-clock labelled UTC and is sliced raw
// (docs/19-known-quirks.md #16). `today` is injected (never Date.now()) so the
// rule is a pure, unit-testable function.

import { businessDateIso } from '@magguarantee/shared';
import type { DelegationDto, VehicleDailyKmDto } from '@magguarantee/shared';

/** A delegation, reduced to the fields the window rule reads. */
type CalendarDelegation = Pick<
  DelegationDto,
  | 'departureAt'
  | 'actualDepartureAt'
  | 'plannedReturnAt'
  | 'actualReturnAt'
  | 'status'
>;

/** A km row, reduced to the only field the window rule reads. */
type CalendarKmRow = Pick<VehicleDailyKmDto, 'date'>;

/**
 * Date portion (`YYYY-MM-DD`) of a date or datetime ISO string — a raw slice,
 * no zone conversion. Correct for the date-only fields (`plannedReturnAt`, km
 * `date`) and for the Warsaw wall-clock-labelled-UTC `actual*At`; NOT for the
 * true-UTC `departureAt` (use {@link delegationStartDay}).
 */
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The delegation's START DAY (`YYYY-MM-DD`) — the single anchor shared by the
 * km FETCH range (`from` of the history query) and the RENDER window
 * ({@link deriveCalendarWindow}), so the two can never drift apart.
 *
 *   actualDepartureAt set → its raw date portion. The verifier-corrected real
 *     start is Warsaw WALL-CLOCK LABELLED UTC (the weryfikator types 00:30, the
 *     api stores `…T00:30:00Z`), so the slice IS the business date; converting
 *     it to Warsaw would push a late-evening start into the next day (UWAGI #26
 *     in reverse).
 *   else departureAt      → its Warsaw calendar date. The carrier-reported
 *     departure is a TRUE UTC instant (the form posts
 *     `new Date(datetimeLocal).toISOString()`), so a raw slice would be the UTC
 *     day — one day early for a departure declared at 00:00–00:59 CET /
 *     00:00–01:59 CEST (UWAGI #30).
 *
 * docs/19-known-quirks.md #16 (dual timestamp convention on Delegation).
 */
export function delegationStartDay(
  actualDepartureAt: string | null,
  departureAt: string,
): string {
  return actualDepartureAt
    ? dateOnly(actualDepartureAt)
    : businessDateIso(new Date(departureAt));
}

/**
 * The FETCH `to` — a broad upper bound passed to the km-history query so the
 * returned rows include every day that could legitimately have km.
 *
 *   w_trasie          → today (open trip; km may extend up to yesterday)
 *   zjechal           → actualReturnAt (closed; nothing exists beyond it)
 *   gotowy/zgloszony  → plannedReturnAt (not departed yet; planning window)
 *   (other/cancelled) → plannedReturnAt (safe default)
 *
 * `today` must already be the business-timezone (Europe/Warsaw) calendar date.
 */
export function calendarFetchTo(
  delegation: CalendarDelegation,
  today: string,
): string {
  switch (delegation.status) {
    case 'w_trasie':
      return today;
    case 'zjechal':
      // `actualReturnAt` is set on the w_trasie→zjechal transition; fall back
      // to plannedReturnAt defensively if it is somehow absent.
      return delegation.actualReturnAt
        ? dateOnly(delegation.actualReturnAt)
        : dateOnly(delegation.plannedReturnAt);
    default:
      return dateOnly(delegation.plannedReturnAt);
  }
}

/**
 * The RENDER window `{ fromIso, toIso }` — what the day-strip actually draws.
 *
 *   start (fromIso) = {@link delegationStartDay} — anchor; the raw date of the
 *     verifier-corrected `actualDepartureAt` when present (so days between the
 *     carrier's reported departure and the actual start are excluded), else
 *     the WARSAW calendar date of the reported `departureAt` (a true UTC
 *     instant — never its UTC slice); either way excludes prior-trip days
 *   renderEnd (toIso) =
 *     zjechal          → actualReturnAt            — closed; later km belong to next trip
 *     w_trasie         → max(plannedReturnAt, lastKmDate)
 *     gotowy/zgloszony → plannedReturnAt
 *     (other)          → plannedReturnAt
 *
 * `lastKmDate` = the latest `kmRows[].date` that is ≥ `fromIso` (rows for days
 * before departure belong to a previous trip and are ignored). When no such row
 * exists, `lastKmDate` is absent and the w_trasie end falls back to
 * `plannedReturnAt`.
 *
 * `today` is part of the stable, documented signature
 * (`deriveCalendarWindow(delegation, kmRows, today)`) and is injected for
 * testability / symmetry with {@link calendarFetchTo}; the render end is purely
 * data-driven, so it is intentionally not read here.
 */
export function deriveCalendarWindow(
  delegation: CalendarDelegation,
  kmRows: readonly CalendarKmRow[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved, documented signature
  today: string,
): { fromIso: string; toIso: string } {
  const fromIso = delegationStartDay(
    delegation.actualDepartureAt,
    delegation.departureAt,
  );
  const plannedEnd = dateOnly(delegation.plannedReturnAt);

  let toIso: string;
  switch (delegation.status) {
    case 'zjechal': {
      toIso = delegation.actualReturnAt
        ? dateOnly(delegation.actualReturnAt)
        : plannedEnd;
      break;
    }
    case 'w_trasie': {
      const lastKmDate = latestKmDateOnOrAfter(kmRows, fromIso);
      // ISO lexical max — render at least to the plan, further if km overrun.
      toIso =
        lastKmDate && lastKmDate > plannedEnd ? lastKmDate : plannedEnd;
      break;
    }
    default: {
      // gotowy / zgloszony / anulowany — no overrun concept; use the plan.
      toIso = plannedEnd;
      break;
    }
  }

  return { fromIso, toIso };
}

/** Latest `YYYY-MM-DD` among rows whose date ≥ `fromIso`, or null if none. */
function latestKmDateOnOrAfter(
  kmRows: readonly CalendarKmRow[],
  fromIso: string,
): string | null {
  let latest: string | null = null;
  for (const row of kmRows) {
    const d = dateOnly(row.date);
    if (d < fromIso) continue; // prior-trip day — ignore
    if (latest === null || d > latest) latest = d;
  }
  return latest;
}
