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
// order, so no Date parsing is needed here. `today` is injected (never
// Date.now()) so the rule is a pure, unit-testable function.

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

/** Date portion (`YYYY-MM-DD`) of a date or datetime ISO string. */
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
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
 *   start (fromIso) = date(actualDepartureAt ?? departureAt)  — anchor; the
 *     verifier-corrected real start when present (so days between the carrier's
 *     reported departure and the actual start are excluded), else the reported
 *     departure; either way excludes prior-trip days
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
  const fromIso = dateOnly(
    delegation.actualDepartureAt ?? delegation.departureAt,
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
