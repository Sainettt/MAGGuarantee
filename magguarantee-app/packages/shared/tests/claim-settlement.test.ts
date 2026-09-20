// Fixture suite for `settleClaim` + `limitsSnapshotFromBreakdown`
// (`src/domain/claim-settlement.ts`), the payout layer of the «wyłączane
// limity gwarancji» feature (2026-09-20).
//
// The invariant every fixture is written around: while every month of the
// period guarantees something, the settlement MUST reproduce the pre-feature
// formula (`kmGuaranteed − mileage`) exactly — no float drift, no rounding
// difference. Only once a month (or the weekdays of a "Saturdays only" month)
// is switched off does the proportional split kick in.
//
// Coverage:
//   1  all months active, single month        (identity with the old formula)
//   2  all months active, two months          (identity)
//   3  every month disabled
//   4  mixed 2-month
//   5  mixed 3-month
//   6  "Saturdays only" month (kmPerDay = 0, kmPerSaturday > 0)
//   7  daysTotal = 0 (empty breakdown)
//   8  mileage = 0
//   9  negative kmDifference (carrier out-drove the guarantee)
//  10  rounding boundary on mileageEffective
//  11  rounding boundary on paymentEur
//  12  fractional working days
//  13  legacy breakdown row (no Saturday fields)
//  14  disabled month that contributed no days (hint still raised)
//  15+ `limitsSnapshotFromBreakdown` + the FALLBACK_KM_PER_SATURDAY engine pin

import { describe, expect, it } from 'vitest';

import {
  calcKmGwarantPerMonth,
  type MonthLimit,
} from '../src/domain/km-calc';
import {
  isMonthActive,
  limitsSnapshotFromBreakdown,
  settleClaim,
  type SettlementMonth,
} from '../src/domain/claim-settlement';

/** Month with the guarantee ON (the ordinary case). */
function active(
  workingDays: number,
  overrides: Partial<SettlementMonth> = {},
): SettlementMonth {
  return { kmPerDay: 540, workingDays, saturdaysCounted: 0, ...overrides };
}

/** Month with the guarantee explicitly switched OFF (0 / 0). */
function disabled(
  workingDays: number,
  overrides: Partial<SettlementMonth> = {},
): SettlementMonth {
  return {
    kmPerDay: 0,
    kmPerSaturday: 0,
    workingDays,
    saturdaysCounted: 0,
    ...overrides,
  };
}

/** The pre-feature formula, kept here as the oracle for the identity tests. */
function legacySettlement(
  kmGuaranteed: number,
  mileage: number,
  rate: number,
): { kmDifference: number; paymentEur: number } {
  const kmDifference = kmGuaranteed - mileage;
  return {
    kmDifference,
    paymentEur:
      kmDifference > 0 ? Math.round(kmDifference * rate * 100) / 100 : 0,
  };
}

describe('settleClaim — every month active (identity with the legacy formula)', () => {
  it('1. single active month reproduces `kmGuaranteed − mileage` exactly', () => {
    const out = settleClaim({
      breakdown: [active(20)],
      mileage: 8_000,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
    });
    expect(out).toEqual({
      daysActive: 20,
      daysTotal: 20,
      mileageEffective: 8_000,
      kmDifference: 2_800,
      paymentEur: 1_400,
      hasDisabledMonths: false,
    });
    expect({
      kmDifference: out.kmDifference,
      paymentEur: out.paymentEur,
    }).toEqual(legacySettlement(10_800, 8_000, 0.5));
  });

  it('2. two active months (incl. credited Saturdays) reproduce the legacy numbers', () => {
    const out = settleClaim({
      breakdown: [
        active(18, { kmPerSaturday: 270, saturdaysCounted: 2 }),
        active(10),
      ],
      mileage: 12_345.67,
      kmGuaranteed: 15_660,
      ratePerKmEffective: 0.48,
    });
    expect(out.daysActive).toBe(30);
    expect(out.daysTotal).toBe(30);
    // Untouched mileage — the short-circuit branch, not a re-multiplication.
    expect(out.mileageEffective).toBe(12_345.67);
    expect({
      kmDifference: out.kmDifference,
      paymentEur: out.paymentEur,
    }).toEqual(legacySettlement(15_660, 12_345.67, 0.48));
    expect(out.hasDisabledMonths).toBe(false);
  });
});

describe('settleClaim — disabled months', () => {
  it('3. every month disabled: nothing is charged, nothing is paid', () => {
    const out = settleClaim({
      breakdown: [disabled(10), disabled(12)],
      mileage: 9_000,
      kmGuaranteed: 0,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysActive).toBe(0);
    expect(out.daysTotal).toBe(22);
    expect(out.mileageEffective).toBe(0);
    expect(out.kmDifference).toBe(0);
    expect(out.paymentEur).toBe(0);
    expect(out.hasDisabledMonths).toBe(true);
  });

  it('4. mixed 2-month: only the active share of the mileage is charged', () => {
    // 10 active days of 25 ⇒ 40% of the mileage.
    const out = settleClaim({
      breakdown: [active(10), disabled(15)],
      mileage: 10_000,
      kmGuaranteed: 5_400,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysActive).toBe(10);
    expect(out.daysTotal).toBe(25);
    expect(out.mileageEffective).toBe(4_000);
    expect(out.kmDifference).toBe(1_400);
    expect(out.paymentEur).toBe(700);
    expect(out.hasDisabledMonths).toBe(true);
    // The whole point of the feature: the legacy formula would have wiped the
    // compensation out entirely (5_400 − 10_000 < 0 ⇒ 0 EUR).
    expect(legacySettlement(5_400, 10_000, 0.5).paymentEur).toBe(0);
  });

  it('5. mixed 3-month: two active, one off', () => {
    const out = settleClaim({
      breakdown: [active(20), disabled(10), active(10)],
      mileage: 12_000,
      kmGuaranteed: 16_200,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysActive).toBe(30);
    expect(out.daysTotal).toBe(40);
    expect(out.mileageEffective).toBe(9_000);
    expect(out.kmDifference).toBe(7_200);
    expect(out.paymentEur).toBe(3_600);
  });

  it('6. "Saturdays only" month: its weekdays are NOT active, its Saturdays are', () => {
    // February: kmPerDay = 0 but kmPerSaturday = 270 with 2 credited Saturdays.
    // 18 weekdays must land in daysTotal and stay OUT of daysActive.
    const out = settleClaim({
      breakdown: [
        { kmPerDay: 0, kmPerSaturday: 270, workingDays: 18, saturdaysCounted: 2 },
        active(10),
      ],
      mileage: 6_000,
      kmGuaranteed: 5_940,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysTotal).toBe(30);
    expect(out.daysActive).toBe(12); // 2 Saturdays + 10 active weekdays
    expect(out.mileageEffective).toBe(2_400); // 6_000 × 12/30
    expect(out.kmDifference).toBe(3_540);
    expect(out.paymentEur).toBe(1_770);
    // The month DOES guarantee something, so `isMonthActive` is true …
    expect(
      isMonthActive({
        kmPerDay: 0,
        kmPerSaturday: 270,
        workingDays: 18,
        saturdaysCounted: 2,
      }),
    ).toBe(true);
    // … yet part of it is switched off, so the UI hint must still fire.
    expect(out.hasDisabledMonths).toBe(true);
  });

  it('14. a disabled month that contributed no counted days still raises the hint', () => {
    const out = settleClaim({
      breakdown: [active(20), disabled(0)],
      mileage: 8_000,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysActive).toBe(20);
    expect(out.daysTotal).toBe(20);
    // Equal counts ⇒ the mileage passes through untouched …
    expect(out.mileageEffective).toBe(8_000);
    expect(out.kmDifference).toBe(2_800);
    // … but the period genuinely contains a switched-off month.
    expect(out.hasDisabledMonths).toBe(true);
  });
});

describe('settleClaim — edge cases', () => {
  it('7. empty breakdown (daysTotal = 0) behaves like the legacy formula', () => {
    const out = settleClaim({
      breakdown: [],
      mileage: 4_200,
      kmGuaranteed: 0,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysActive).toBe(0);
    expect(out.daysTotal).toBe(0);
    expect(out.mileageEffective).toBe(4_200);
    expect(out.kmDifference).toBe(-4_200);
    expect(out.paymentEur).toBe(0);
    expect(out.hasDisabledMonths).toBe(false);
  });

  it('8. mileage = 0 pays the whole guarantee, split or not', () => {
    const out = settleClaim({
      breakdown: [active(10), disabled(10)],
      mileage: 0,
      kmGuaranteed: 5_400,
      ratePerKmEffective: 0.5,
    });
    expect(out.mileageEffective).toBe(0);
    expect(out.kmDifference).toBe(5_400);
    expect(out.paymentEur).toBe(2_700);
  });

  it('9. carrier out-drove the guarantee ⇒ negative difference, zero payout', () => {
    const out = settleClaim({
      breakdown: [active(20)],
      mileage: 15_000,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
    });
    expect(out.kmDifference).toBe(-4_200);
    expect(out.paymentEur).toBe(0);
  });

  it('10. mileageEffective is rounded to 2 decimals (Decimal(10,2) column)', () => {
    // 1_000 × 1/3 = 333.3333… ⇒ 333.33
    const out = settleClaim({
      breakdown: [active(1), disabled(2)],
      mileage: 1_000,
      kmGuaranteed: 540,
      ratePerKmEffective: 0.5,
    });
    expect(out.mileageEffective).toBe(333.33);
    // `kmDifference` is deliberately NOT rounded (same as the legacy formula —
    // the Decimal(10,2) column rounds on persist), hence `toBeCloseTo`.
    expect(out.kmDifference).toBeCloseTo(206.67, 2);
    expect(out.paymentEur).toBe(103.34); // round2(206.67 × 0.5) = 103.335 → 103.34
  });

  it('11. paymentEur rounds half-up at the cent', () => {
    const out = settleClaim({
      breakdown: [active(2)],
      mileage: 0,
      kmGuaranteed: 1.01,
      ratePerKmEffective: 0.5,
    });
    // 1.01 × 0.5 = 0.505 → 0.51
    expect(out.paymentEur).toBe(0.51);
  });

  it('12. fractional working days (boundary-day fractions) round to 2 dp', () => {
    const out = settleClaim({
      breakdown: [active(9.58), disabled(5.25)],
      mileage: 7_000,
      kmGuaranteed: 5_173,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysActive).toBe(9.58);
    expect(out.daysTotal).toBe(14.83);
    // 7_000 × 9.58 / 14.83 = 4521.9150… ⇒ 4521.92
    expect(out.mileageEffective).toBe(4_521.92);
    expect(out.kmDifference).toBeCloseTo(651.08, 2);
    expect(out.paymentEur).toBe(325.54);
  });

  it('13. legacy breakdown row without Saturday fields is read as "no Saturdays"', () => {
    const out = settleClaim({
      // No `kmPerSaturday`, no `saturdaysCounted` — a pre-Saturday-feature row.
      breakdown: [{ kmPerDay: 540, workingDays: 20 }],
      mileage: 8_000,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysActive).toBe(20);
    expect(out.daysTotal).toBe(20);
    expect(out.mileageEffective).toBe(8_000);
    expect(out.hasDisabledMonths).toBe(false);
  });

  it('non-finite numbers collapse to 0 instead of poisoning the totals', () => {
    const out = settleClaim({
      breakdown: [
        { kmPerDay: Number.NaN, workingDays: 10, saturdaysCounted: 0 },
        active(5),
      ],
      mileage: 3_000,
      kmGuaranteed: 2_700,
      ratePerKmEffective: 0.5,
    });
    expect(out.daysTotal).toBe(15);
    expect(out.daysActive).toBe(5);
    expect(out.mileageEffective).toBe(1_000);
  });
});

describe('limitsSnapshotFromBreakdown', () => {
  it('rebuilds a `YYYY-MM → MonthLimit` map from a persisted breakdown', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [
        { yearMonth: '2026-05', kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
        { yearMonth: '2026-06', kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
      ],
    });
    expect(snapshot).toEqual({
      '2026-05': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
      // A deliberate zero survives the round-trip — that is the whole point.
      '2026-06': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
  });

  it('omits `kmPerSaturday` for legacy rows that predate the field', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [{ yearMonth: '2026-05', kmPerDay: 540, ratePerKm: 0.5 }],
    });
    expect(snapshot['2026-05']).toEqual({ kmPerDay: 540, ratePerKm: 0.5 });
    expect('kmPerSaturday' in snapshot['2026-05']!).toBe(false);
  });

  it('returns {} for null / missing / malformed envelopes', () => {
    expect(limitsSnapshotFromBreakdown(null)).toEqual({});
    expect(limitsSnapshotFromBreakdown(undefined)).toEqual({});
    expect(limitsSnapshotFromBreakdown({})).toEqual({});
    expect(limitsSnapshotFromBreakdown({ breakdown: null })).toEqual({});
  });

  it('drops rows with a bad key or non-numeric limits', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [
        { yearMonth: '2026-13', kmPerDay: 540, ratePerKm: 0.5 },
        { yearMonth: '2026-05', kmPerDay: null, ratePerKm: 0.5 },
        { yearMonth: '2026-06', kmPerDay: 540, ratePerKm: 'x' },
        { yearMonth: '2026-07', kmPerDay: 540, ratePerKm: 0.5 },
      ],
    });
    expect(Object.keys(snapshot)).toEqual(['2026-07']);
  });
});

describe('engine pin — FALLBACK_KM_PER_SATURDAY must stay 0', () => {
  // `resolveKmPerSaturday` in the (frozen) engine treats a month value of `0`
  // as "not set" and falls through to the global fallback. As long as that
  // fallback is 0 the behaviour is indistinguishable from "switched off" — but
  // the day someone gives it a positive default, EVERY month that explicitly
  // disabled its Saturdays silently switches them back on. These two fixtures
  // lock the semantics; the api-side constant carries the matching warning.
  const BASE = {
    // 2026-05-02 is the 1st Saturday of the month (odd ordinal ⇒ qualifying).
    dateStart: '2026-05-01',
    dateEnd: '2026-05-04',
    limits: {
      '2026-05': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    } as Record<string, MonthLimit>,
  };

  it('explicit `kmPerSaturday: 0` + fallback 0 ⇒ Saturdays stay excluded', () => {
    const res = calcKmGwarantPerMonth({
      ...BASE,
      fallback: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
    expect(res.breakdown[0]!.saturdaysCounted).toBe(0);
    expect(res.breakdown[0]!.kmPerSaturday).toBe(0);
  });

  it('REGRESSION TRIPWIRE: a positive fallback would re-enable disabled Saturdays', () => {
    const res = calcKmGwarantPerMonth({
      ...BASE,
      // Simulates someone changing FALLBACK_KM_PER_SATURDAY to 270.
      fallback: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
    });
    // This is NOT desired behaviour — it is the failure mode the pin prevents.
    // If this expectation ever needs changing, the engine's fall-through was
    // fixed and the api constant may finally be made configurable.
    expect(res.breakdown[0]!.saturdaysCounted).toBe(1);
    expect(res.breakdown[0]!.kmPerSaturday).toBe(270);
  });
});
