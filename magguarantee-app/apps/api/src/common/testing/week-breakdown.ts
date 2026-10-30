// Spec helper — one `WeekBreakdown` row (km-calc per ISO week, 2026-10-29).
//
// The claims specs mock `KmCalcService.calc` and hand-roll its result; a
// weekly row carries 14 fields, most of them derivable from the week key.
// This builder fills them in so a fixture only states what it is about.
// Test-only: imported from `*.spec.ts` files, never from production code.

import { isoWeekInfoOfKey, type WeekBreakdown } from '@magguarantee/shared';

/**
 * A breakdown row for ISO week `isoWeek` (`YYYY-Www`). Defaults describe a
 * full, active Mon–Fri week priced at 540 km/day @ 0.5 EUR/km with no Saturday
 * guarantee: `weekStart`/`weekEnd` come from the key, `periodStart` /
 * `periodEnd` default to the full week, `kmInWeek` is DERIVED from the
 * (possibly overridden) `workingDays`, `kmPerDay` and `kmFromSaturdays` unless
 * overridden itself.
 */
export function makeWeekRow(
  isoWeek: string,
  overrides: Partial<WeekBreakdown> = {},
): WeekBreakdown {
  const info = isoWeekInfoOfKey(isoWeek);
  if (info === null) {
    throw new TypeError(`makeWeekRow: not an ISO week key: ${isoWeek}`);
  }
  const workingDays = overrides.workingDays ?? 5;
  const kmPerDay = overrides.kmPerDay ?? 540;
  const kmFromSaturdays = overrides.kmFromSaturdays ?? 0;
  return {
    isoWeek,
    weekStart: info.start,
    weekEnd: info.end,
    periodStart: info.start,
    periodEnd: info.end,
    workingDays,
    kmPerDay,
    ratePerKm: 0.5,
    saturdaysCounted: 0,
    kmPerSaturday: 0,
    kmFromSaturdays,
    saturdayDays: [],
    kmInWeek: Math.round(workingDays * kmPerDay) + kmFromSaturdays,
    excludedDays: [],
    ...overrides,
  };
}
