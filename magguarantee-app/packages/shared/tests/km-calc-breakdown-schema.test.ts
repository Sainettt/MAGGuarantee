// Wire-contract guard for `KmCalcBreakdownSchema` — the shape persisted on
// `Claim.breakdown` (JSONB) and returned by `/preview` + `/claims/:nrZgl`.
//
// Focus: the newly-added `firstDay` / `lastDay` boundary-day fields must be
// backward-compatible with legacy persisted rows (written before the fields
// existed) — those rows omit the keys and MUST still parse, backfilling to
// `null`. New rows carry the `{ date, fraction }` object and round-trip.

import { describe, expect, it } from 'vitest';

import { settleClaim } from '../src/domain/claim-settlement';
import {
  ClaimBoardSettlementSchema,
  KmCalcBreakdownSchema,
} from '../src/schemas/claims';

const BASE = {
  totalDays: 20,
  rawTotalDays: 20,
  kmGuaranteed: 10_800,
  ratePerKmEffective: 0.5,
  breakdown: [],
};

describe('KmCalcBreakdownSchema — firstDay / lastDay', () => {
  it('legacy row without firstDay/lastDay parses and backfills to null', () => {
    const parsed = KmCalcBreakdownSchema.parse(BASE);
    expect(parsed.firstDay).toBeNull();
    expect(parsed.lastDay).toBeNull();
    // Existing backfill (rawTotalDays) still applies alongside the new one.
    expect(parsed.rawTotalDays).toBe(20);
  });

  it('explicit null firstDay/lastDay round-trips as null', () => {
    const parsed = KmCalcBreakdownSchema.parse({
      ...BASE,
      firstDay: null,
      lastDay: null,
    });
    expect(parsed.firstDay).toBeNull();
    expect(parsed.lastDay).toBeNull();
  });

  it('new row carries the credited boundary fractions verbatim', () => {
    const parsed = KmCalcBreakdownSchema.parse({
      ...BASE,
      firstDay: { date: '2026-03-09', fraction: 0.75 },
      lastDay: { date: '2026-03-13', fraction: 0.5 },
    });
    expect(parsed.firstDay).toEqual({ date: '2026-03-09', fraction: 0.75 });
    expect(parsed.lastDay).toEqual({ date: '2026-03-13', fraction: 0.5 });
  });

  it('an excluded boundary day is a valid { date, fraction: 0 } (distinct from null)', () => {
    const parsed = KmCalcBreakdownSchema.parse({
      ...BASE,
      firstDay: { date: '2026-03-08', fraction: 0 },
      lastDay: { date: '2026-03-12', fraction: 1 },
    });
    expect(parsed.firstDay).toEqual({ date: '2026-03-08', fraction: 0 });
    expect(parsed.lastDay).toEqual({ date: '2026-03-12', fraction: 1 });
  });

  it('rejects a malformed boundary date', () => {
    const res = KmCalcBreakdownSchema.safeParse({
      ...BASE,
      firstDay: { date: 'not-a-date', fraction: 1 },
    });
    expect(res.success).toBe(false);
  });
});

describe('KmCalcBreakdownSchema — settlement fields (2026-09-20)', () => {
  it('legacy row backfills daysActive/daysTotal to totalDays, leaves mileageEffective undefined', () => {
    const parsed = KmCalcBreakdownSchema.parse(BASE);
    expect(parsed.daysActive).toBe(20);
    expect(parsed.daysTotal).toBe(20);
    // Deliberately NOT backfilled — the UI falls back to `claim.mileage`.
    expect(parsed.mileageEffective).toBeUndefined();
  });

  it('a fresh row round-trips all three settlement fields', () => {
    const parsed = KmCalcBreakdownSchema.parse({
      ...BASE,
      daysActive: 12,
      daysTotal: 30,
      mileageEffective: 2_400,
    });
    expect(parsed.daysActive).toBe(12);
    expect(parsed.daysTotal).toBe(30);
    expect(parsed.mileageEffective).toBe(2_400);
  });

  it('a fully-disabled period parses (daysActive = 0, mileageEffective = 0)', () => {
    const parsed = KmCalcBreakdownSchema.parse({
      ...BASE,
      kmGuaranteed: 0,
      daysActive: 0,
      daysTotal: 22,
      mileageEffective: 0,
    });
    expect(parsed.daysActive).toBe(0);
    expect(parsed.mileageEffective).toBe(0);
  });

  it('rejects negative settlement values', () => {
    expect(() =>
      KmCalcBreakdownSchema.parse({ ...BASE, daysActive: -1 }),
    ).toThrow();
    expect(() =>
      KmCalcBreakdownSchema.parse({ ...BASE, mileageEffective: -0.01 }),
    ).toThrow();
  });
});

describe('KmCalcBreakdownSchema — mileageSource (2026-09-24, docs/20 §0⁵)', () => {
  it('is NOT backfilled: a legacy row keeps it undefined (⇒ "declared")', () => {
    const parsed = KmCalcBreakdownSchema.parse(BASE);
    expect(parsed.mileageSource).toBeUndefined();
  });

  it('round-trips both sources', () => {
    expect(
      KmCalcBreakdownSchema.parse({ ...BASE, mileageSource: 'declared' })
        .mileageSource,
    ).toBe('declared');
    expect(
      KmCalcBreakdownSchema.parse({ ...BASE, mileageSource: 'board' })
        .mileageSource,
    ).toBe('board');
  });

  it('rejects an unknown source', () => {
    expect(
      KmCalcBreakdownSchema.safeParse({ ...BASE, mileageSource: 'proportional' })
        .success,
    ).toBe(false);
  });
});

describe('ClaimBoardSettlementSchema', () => {
  it('accepts what the api builds from a board settlement', () => {
    const settlement = settleClaim({
      breakdown: [
        { yearMonth: '2025-08', kmPerDay: 0, kmPerSaturday: 0, workingDays: 7 },
        { yearMonth: '2025-09', kmPerDay: 540, workingDays: 14 },
      ],
      mileage: 6_000,
      kmGuaranteed: 7_560,
      ratePerKmEffective: 0.5,
      dateStart: '2025-08-21',
      dateEnd: '2025-09-18',
      board: [{ date: '2025-09-01', state: 'drove', km: 2_000 }],
    });
    const wire = {
      mileageEffective: settlement.mileageEffective,
      kmDifference: settlement.kmDifference,
      paymentEur: settlement.paymentEur,
      months: settlement.board!.months,
      missingDates: settlement.board!.missingDates,
      complete: settlement.board!.complete,
    };
    const parsed = ClaimBoardSettlementSchema.parse(wire);
    expect(parsed.paymentEur).toBe(2_780);
    expect(parsed.complete).toBe(false);
    expect(parsed.missingDates).toHaveLength(17);
    expect(parsed.months.map((m) => m.mode)).toEqual(['off', 'active']);
  });

  it('rejects an unknown month mode and a malformed missing date', () => {
    const base = {
      mileageEffective: 0,
      kmDifference: 0,
      paymentEur: 0,
      months: [],
      missingDates: [],
      complete: true,
    };
    expect(ClaimBoardSettlementSchema.safeParse(base).success).toBe(true);
    expect(
      ClaimBoardSettlementSchema.safeParse({
        ...base,
        months: [
          {
            yearMonth: '2025-09',
            mode: 'partial',
            km: 0,
            daysFilled: 0,
            daysRequired: 0,
            missingDates: [],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ClaimBoardSettlementSchema.safeParse({ ...base, missingDates: ['1.09.2025'] })
        .success,
    ).toBe(false);
  });
});
