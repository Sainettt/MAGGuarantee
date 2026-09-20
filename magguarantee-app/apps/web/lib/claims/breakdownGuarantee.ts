// How the carrier-facing breakdown reads a month whose guarantee is switched
// off (docs/14 §16.5). Derived ENTIRELY from fields the breakdown already
// carries — there are no new per-month API fields and there will be none.
//
//   disabled     — `kmPerDay === 0 && kmPerSaturday === 0` → nothing is paid
//   saturdayOnly — `kmPerDay === 0 && kmFromSaturdays > 0` → weekdays off,
//                  Saturdays still pay (the row is NOT muted: it pays)
//
// Runtime note: `KmCalcBreakdown` is a Zod-INFERRED type whose `.transform()`
// backfills `daysActive` / `daysTotal`, but the web client does not re-parse
// API responses — a legacy `Claim.breakdown` really can arrive without those
// keys at runtime even though TypeScript says `number`. Every read below goes
// through `finite()` for that reason.
//
// Pure, framework-free, unit-tested (`breakdownGuarantee.test.ts`).

import type { KmCalcBreakdown, MonthBreakdownDto } from '@magguarantee/shared';

function finite(value: number | undefined | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isMonthGuaranteeDisabled(row: MonthBreakdownDto): boolean {
  return (finite(row.kmPerDay) ?? 0) === 0 && (finite(row.kmPerSaturday) ?? 0) === 0;
}

export function isMonthSaturdayOnly(row: MonthBreakdownDto): boolean {
  return (
    (finite(row.kmPerDay) ?? 0) === 0 && (finite(row.kmFromSaturdays) ?? 0) > 0
  );
}

/** Counted days of one month = weekday days + qualifying Saturdays. */
export function monthCountedDays(row: MonthBreakdownDto): number {
  return (finite(row.workingDays) ?? 0) + (finite(row.saturdaysCounted) ?? 0);
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

export interface DisabledMonthInfo {
  yearMonth: string;
  /** Counted days this (disabled) month contributes to the period. */
  days: number;
}

export interface BreakdownGuaranteeInfo {
  disabledMonths: DisabledMonthInfo[];
  disabledCount: number;
  activeCount: number;
  /** Every month of the period is off → `<EmptyState>` instead of zero rows. */
  allDisabled: boolean;
  /** Mixed period → `<GuaranteeGapNotice>` ABOVE the table. */
  showGapNotice: boolean;
  daysActive: number;
  daysTotal: number;
  /** Mileage actually charged against the guarantee. */
  mileageEffective: number;
  /** Mileage the carrier declared. */
  mileage: number;
}

/**
 * @param mileage the claim's / preview's declared mileage. Used as the
 * `mileageEffective` fallback for legacy wnioski, which never carry the field
 * (deliberately not backfilled server-side — its absence means "no
 * proportional split happened").
 */
export function analyzeBreakdown(
  breakdown: KmCalcBreakdown,
  mileage?: number | null,
): BreakdownGuaranteeInfo {
  const rows = breakdown.breakdown ?? [];
  const disabledMonths: DisabledMonthInfo[] = [];
  let activeCount = 0;

  for (const row of rows) {
    if (isMonthGuaranteeDisabled(row)) {
      disabledMonths.push({
        yearMonth: row.yearMonth,
        days: monthCountedDays(row),
      });
    } else {
      activeCount += 1;
    }
  }

  const totalDays = finite(breakdown.totalDays) ?? 0;
  const daysTotal = finite(breakdown.daysTotal) ?? totalDays;
  const daysActive = finite(breakdown.daysActive) ?? totalDays;
  const declared = finite(mileage);
  const effective = finite(breakdown.mileageEffective);

  return {
    disabledMonths,
    disabledCount: disabledMonths.length,
    activeCount,
    allDisabled: rows.length > 0 && activeCount === 0,
    showGapNotice: disabledMonths.length > 0 && activeCount > 0,
    daysActive,
    daysTotal,
    mileageEffective: effective ?? declared ?? 0,
    mileage: declared ?? effective ?? 0,
  };
}
