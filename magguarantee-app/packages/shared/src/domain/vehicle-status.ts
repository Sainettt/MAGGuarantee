// Vehicle lifecycle status — pure live-state computation for the
// delegation-driven fleet lifecycle (Vehicle-status rework, Step A).
//
// A LIVE vehicle's lifecycle status is derived at READ time (there is NO stored
// status column). It answers "is this truck working, idle, or overdue for
// removal?" from four inputs the caller has already resolved:
//   - `active`             — `Vehicle.active` (manual deactivation switch),
//   - `hasActiveDelegation`— a non-terminal delegation exists
//                            (status ∈ {zgloszony, gotowy, w_trasie}),
//   - `lastReturnAt`       — the latest zjechał `actualReturnAt`, or `null`,
//   - `createdAt`          — the vehicle's creation instant (fallback anchor).
//
// Pure TypeScript, side-effect free, schema-agnostic: NO Prisma, no Nest, no
// Next, no clock reads — every date is passed in (mirrors the sibling
// `guarantee-watchdog.ts` contract). The API fleet aggregates and the web fleet
// badges bundle the same code so the day-count / bucketing never drifts.
//
// Calendar-day convention: `daysSinceReturn` is CALENDAR days in Europe/Warsaw
// (NOT working days — unlike the watchdog). The anchor and `today` are both
// reduced to their Warsaw calendar date before differencing via
// `calendarDaysBetween`, so time-of-day / DST / UTC offset never shift the
// count. `today` is expected as `startOfBusinessTodayUtc()` (Warsaw-date UTC
// midnight); `lastReturnAt` is the date-only UTC-midnight convention;
// `createdAt` is a full instant reduced to its Warsaw date.

import { calendarDaysBetween } from './business-date';

// ─── Public types ────────────────────────────────────────

/**
 * Live lifecycle status for one vehicle (delegation-driven model):
 *
 *   - `wylaczona`    — `active=false` (manually deactivated). Orthogonal to the
 *                      idle clock — a deactivated truck is off the board and
 *                      carries no day count.
 *   - `aktywna`      — `active=true` AND a non-terminal delegation exists; the
 *                      truck is working right now, so the idle clock is silenced
 *                      (mirror of the watchdog's `ok_active` null-contract).
 *   - `stojaca`      — active, no active delegation, idle 0–14 calendar days.
 *   - `nieaktywna`   — …idle 15–28 calendar days.
 *   - `do_usuniecia` — …idle ≥29 calendar days (overdue for removal review).
 */
export type VehicleLifecycleStatus =
  | 'wylaczona'
  | 'aktywna'
  | 'stojaca'
  | 'nieaktywna'
  | 'do_usuniecia';

/** Where the idle anchor came from when the clock is running. */
export type VehicleLifecycleAnchorSource = 'zjechal' | 'created';

/** Resolved inputs for one vehicle. */
export interface VehicleLifecycleInput {
  /** "Today" as a Warsaw calendar date, UTC midnight (`startOfBusinessTodayUtc()`). */
  readonly today: Date;
  /** `Vehicle.active` — the manual on/off switch. */
  readonly active: boolean;
  /** True while a zgloszony/gotowy/w_trasie delegation exists (anulowany/zjechał excluded). */
  readonly hasActiveDelegation: boolean;
  /** `date(actualReturnAt)` of the latest zjechał delegation, or `null` if never. */
  readonly lastReturnAt: Date | null;
  /** `Vehicle.createdAt` — full instant, fallback anchor when never returned. */
  readonly createdAt: Date;
}

/**
 * Live lifecycle result. Anchor-related fields are `null` exactly when the
 * status carries no running idle clock:
 *   - `wylaczona` → all `null` (deactivated, clock excluded).
 *   - `aktywna`   → all `null` (clock deliberately silenced by an active
 *                   delegation — a stale count would mislead the board, so we
 *                   do NOT report it; mirror of the watchdog contract).
 *   - `stojaca` / `nieaktywna` / `do_usuniecia` → all populated.
 */
export interface VehicleLifecycleResult {
  readonly status: VehicleLifecycleStatus;
  /** Calendar days since the anchor (clamped ≥0), or `null` when no clock runs. */
  readonly daysSinceReturn: number | null;
  /** The idle-clock anchor, or `null` when no clock runs. */
  readonly anchorAt: Date | null;
  /** Which input produced the anchor, or `null` when no clock runs. */
  readonly anchorSource: VehicleLifecycleAnchorSource | null;
}

// ─── Constants ───────────────────────────────────────────

/**
 * Upper bound (inclusive) of the `stojaca` bucket, in calendar days since the
 * anchor. `daysSinceReturn <= 14` ⇒ `stojaca`.
 */
export const VEHICLE_STOJACA_MAX_DAYS = 14;

/**
 * Upper bound (inclusive) of the `nieaktywna` bucket, in calendar days.
 * `15 <= daysSinceReturn <= 28` ⇒ `nieaktywna`; `daysSinceReturn > 28`
 * (i.e. ≥29) ⇒ `do_usuniecia`.
 */
export const VEHICLE_NIEAKTYWNA_MAX_DAYS = 28;

// ─── Public API ──────────────────────────────────────────

/**
 * Classify one vehicle's live lifecycle status (delegation-driven model).
 *
 * Decision order (short-circuits top to bottom):
 *   1. `!active` → `wylaczona`, all anchor fields `null`. The manual switch
 *      wins over everything and takes the truck off the idle clock.
 *   2. `hasActiveDelegation` → `aktywna`, all anchor fields `null`. An active
 *      delegation silences the clock (see the contract note on the result).
 *   3. Otherwise the idle clock runs from
 *      `anchor = lastReturnAt ?? createdAt` (`anchorSource` `'zjechal'` when the
 *      last return provided it, else `'created'`);
 *      `daysSinceReturn = max(0, calendarDaysBetween(anchor, today))`
 *      (clamped so a future-dated anchor can't go negative);
 *      bucketed by {@link VEHICLE_STOJACA_MAX_DAYS} /
 *      {@link VEHICLE_NIEAKTYWNA_MAX_DAYS}.
 */
export function computeVehicleLifecycleStatus(
  input: VehicleLifecycleInput,
): VehicleLifecycleResult {
  const { today, active, hasActiveDelegation, lastReturnAt, createdAt } = input;

  if (!active) {
    return {
      status: 'wylaczona',
      daysSinceReturn: null,
      anchorAt: null,
      anchorSource: null,
    };
  }

  if (hasActiveDelegation) {
    return {
      status: 'aktywna',
      daysSinceReturn: null,
      anchorAt: null,
      anchorSource: null,
    };
  }

  // FUTURE (anti-abuse): once same-`(carrierId, plateNumber)` re-add is
  // permitted (the planned "no re-add for 3 months after admin deletion" rule),
  // the caller MUST resolve `lastReturnAt`/`createdAt` across the soft-deleted
  // tombstone predecessors of the same `(carrierId, plateNumber)` BEFORE calling
  // this — a delete+recreate must not reset the idle clock. Today the DB
  // `@@unique([carrierId, plateNumber])` blocks recreate, so a row-level anchor
  // (this vehicle's own `createdAt` / last zjechał) is observably equivalent.
  const anchorAt = lastReturnAt ?? createdAt;
  const anchorSource: VehicleLifecycleAnchorSource =
    lastReturnAt !== null ? 'zjechal' : 'created';
  const daysSinceReturn = Math.max(0, calendarDaysBetween(anchorAt, today));
  const status = bucketForDays(daysSinceReturn);

  return { status, daysSinceReturn, anchorAt, anchorSource };
}

/** Maps a clamped idle day-count to its bucket (constants above). */
function bucketForDays(days: number): VehicleLifecycleStatus {
  if (days <= VEHICLE_STOJACA_MAX_DAYS) return 'stojaca';
  if (days <= VEHICLE_NIEAKTYWNA_MAX_DAYS) return 'nieaktywna';
  return 'do_usuniecia';
}
