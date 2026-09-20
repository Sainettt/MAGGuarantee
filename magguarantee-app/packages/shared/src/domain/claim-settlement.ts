// Claim settlement — turns a km-calc result + the declared mileage into the
// numbers a wniosek is actually paid on (`kmDifference`, `paymentEur`).
//
// Feature «wyłączane limity gwarancji» (2026-09-20). Until now the payout was
//
//     kmDifference = kmGuaranteed − mileage
//
// which compares the mileage of the WHOLE period against the SUM of the
// per-month guarantees. That is correct only while every month of the period
// carries a guarantee. The moment an admin switches one month OFF
// (`kmPerDay = 0`, `kmPerSaturday = 0`) its kilometres keep being subtracted
// from the guarantee of the neighbouring, still-active month — and the
// carrier loses compensation it is legally owed for the active month.
//
// The approved fix is a PROPORTIONAL distribution of the mileage over the
// counted days, so only the share of the mileage that falls on ACTIVE months
// is charged against the guarantee:
//
//     daysActive        = Σ over ALL months [ (kmPerDay > 0 ? workingDays : 0)
//                                            + saturdaysCounted ]
//     daysTotal         = Σ over ALL months [ workingDays + saturdaysCounted ]
//     mileageEffective  = daysActive === daysTotal ? mileage
//                       : daysTotal > 0 ? round2(mileage × daysActive / daysTotal)
//                       : 0
//     kmDifference      = kmGuaranteed − mileageEffective
//     paymentEur        = kmDifference > 0 ? round2(kmDifference × ratePerKmEffective) : 0
//
// The split is BY DAY TYPE, not by month (uiux review 2026-09-20): a month
// configured as "Saturdays only" (`kmPerDay = 0`, `kmPerSaturday > 0`) is a
// supported configuration, and its WEEKDAYS guarantee nothing — counting them
// as active would charge their mileage against the Saturday guarantee. The
// Saturday term needs no condition: the engine only ever credits
// `saturdaysCounted > 0` when `kmPerSaturday > 0`.
//
// The `daysActive === daysTotal → mileage` short-circuit is NOT an
// optimisation: it guarantees bit-identical output to the pre-feature formula
// for every wniosek whose months are all active (i.e. everything in the DB
// today), with zero floating-point drift.
//
// NOT handled here (deliberate, business decision):
//  - `Claim.drivenDays` / `Claim.kmPerDay` stay computed over the FULL period
//    (they describe the actual outing, not the settlement);
//  - the `max_avg_km_per_day` sanity check stays on the RAW `mileage / totalDays`;
//  - the `canSubmitByDuration` (≥10 days) gate stays on `calc.totalDays`.
//
// Pure functions, no IO — shared by the API (submit / verify / recalc /
// preview) and the web live-preview so both price a claim identically.

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
}

export interface ClaimSettlement {
  /** Counted days that fall on months whose guarantee is ON. */
  daysActive: number;
  /** Counted days over the whole period (≡ `KmCalcResult.totalDays`). */
  daysTotal: number;
  /** The share of `mileage` charged against the guarantee. */
  mileageEffective: number;
  /** `kmGuaranteed − mileageEffective`; may be negative (no under-run). */
  kmDifference: number;
  /** Compensation in EUR, `0` when there is no under-run. */
  paymentEur: number;
  /** At least one month of the period has its guarantee switched off. */
  hasDisabledMonths: boolean;
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
function num(v: number | undefined): number {
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

/** Counted days of one month = weekday days + qualifying Saturdays. */
function daysOf(month: SettlementMonth): number {
  return num(month.workingDays) + num(month.saturdaysCounted);
}

/**
 * Counted days of one month that actually carry a guarantee.
 *
 * Weekdays count only while `kmPerDay > 0`; qualifying Saturdays always count
 * — the engine credits them exclusively when `kmPerSaturday > 0`, so a
 * non-zero `saturdaysCounted` already implies an active Saturday guarantee.
 * This is what makes the "Saturdays only" month (`kmPerDay = 0`,
 * `kmPerSaturday > 0`) settle correctly: its Saturdays are active, its
 * weekdays are not.
 */
function activeDaysOf(month: SettlementMonth): number {
  const weekdays = num(month.kmPerDay) > 0 ? num(month.workingDays) : 0;
  return weekdays + num(month.saturdaysCounted);
}

// ─── Public API ──────────────────────────────────────────

/**
 * Compute the settlement numbers for one wniosek. Pure; never throws.
 *
 * Degenerate inputs behave exactly like the pre-feature formula:
 *  - empty breakdown / `daysTotal === 0` ⇒ `daysActive === daysTotal` ⇒
 *    `mileageEffective = mileage` (and `kmGuaranteed` is 0 anyway, so the
 *    claim yields `kmDifference = −mileage`, `paymentEur = 0`);
 *  - all months active ⇒ `mileageEffective === mileage`, bit-identical output.
 */
export function settleClaim(input: ClaimSettlementInput): ClaimSettlement {
  let daysActiveRaw = 0;
  let daysTotalRaw = 0;
  let hasDisabledMonths = false;

  for (const month of input.breakdown) {
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

  const daysActive = round2(daysActiveRaw);
  const daysTotal = round2(daysTotalRaw);

  // Identical sums ⇒ nothing is disabled (or the disabled months contributed
  // no days) ⇒ hand the mileage through untouched. This is the branch every
  // pre-feature wniosek takes, so its numbers never move.
  const mileageEffective =
    daysActive === daysTotal
      ? input.mileage
      : daysTotal > 0
        ? round2((input.mileage * daysActive) / daysTotal)
        : /* istanbul ignore next — unreachable: daysActive ≤ daysTotal */ 0;

  const kmDifference = input.kmGuaranteed - mileageEffective;
  const paymentEur =
    kmDifference > 0 ? round2(kmDifference * input.ratePerKmEffective) : 0;

  return {
    daysActive,
    daysTotal,
    mileageEffective,
    kmDifference,
    paymentEur,
    hasDisabledMonths,
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
 *    it to 0 (feature OFF), which is what those wnioski were priced with.
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
