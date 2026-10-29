// Wire-contract guard for the km-calc envelope (`KmCalcBreakdownSchema`, the
// shape persisted on `Claim.breakdown` and returned by `/preview` +
// `/claims/:nrZgl`), its per-week rows (`WeekBreakdownSchema`), the live board
// settlement (`ClaimBoardSettlementSchema`) and the limits-refresh dry run
// (`RecalcLimitsPreviewSchema`) — per ISO week since 2026-10-29
// (docs/13-api-design.md «WeekBreakdown», «ClaimBoardSettlement»).

import { describe, expect, it } from 'vitest';

import { settleClaim } from '../src/domain/claim-settlement';
import { FALLBACK_WEEK_LIMIT, calcKmGwarant } from '../src/domain/km-calc';
import {
  ClaimBoardSettlementSchema,
  KmCalcBreakdownSchema,
  RecalcLimitsPreviewSchema,
  WeekBreakdownSchema,
} from '../src/schemas/claims';

const BASE = {
  totalDays: 5,
  rawTotalDays: 5,
  kmGuaranteed: 2_700,
  ratePerKmEffective: 0.5,
  breakdown: [],
};

const W24 = {
  isoWeek: '2026-W24',
  weekStart: '2026-06-08',
  weekEnd: '2026-06-14',
  periodStart: '2026-06-08',
  periodEnd: '2026-06-14',
  workingDays: 5,
  kmPerDay: 540,
  ratePerKm: 0.5,
  saturdaysCounted: 1,
  kmPerSaturday: 270,
  kmFromSaturdays: 270,
  saturdayDays: ['2026-06-13'],
  kmInWeek: 2_970,
  excludedDays: [],
};

describe('WeekBreakdownSchema', () => {
  it('accepts every row the engine produces (and leaves it unchanged)', () => {
    const result = calcKmGwarant({
      dateStart: '2026-06-03',
      dateEnd: '2027-01-02',
      timeFrom: '10:00',
      timeTo: '14:00',
      hoursAdjusted: 9,
      limits: {
        '2026-W23': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 300 },
        '2026-W33': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 300 }, // Sat 15.08 on a ban
        '2026-W40': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 250 },
      },
      fallback: FALLBACK_WEEK_LIMIT,
    });
    expect(result.breakdown.length).toBeGreaterThan(30);
    for (const row of result.breakdown) {
      expect(WeekBreakdownSchema.parse(row)).toEqual(row);
    }
    expect(KmCalcBreakdownSchema.parse(result).breakdown).toEqual(result.breakdown);
  });

  it('round-trips a hand-written row with a credited Saturday', () => {
    expect(WeekBreakdownSchema.parse(W24)).toEqual(W24);
  });

  it('has no defaults: a row missing a field is rejected', () => {
    for (const key of Object.keys(W24) as Array<keyof typeof W24>) {
      const { [key]: _omitted, ...rest } = W24;
      expect(WeekBreakdownSchema.safeParse(rest).success, key).toBe(false);
    }
  });

  it('rejects a monthly row (yearMonth / kmInMonth)', () => {
    const monthly = {
      yearMonth: '2026-06',
      workingDays: 20,
      kmPerDay: 540,
      ratePerKm: 0.5,
      saturdaysCounted: 0,
      kmPerSaturday: 0,
      kmFromSaturdays: 0,
      kmInMonth: 10_800,
      saturdayDays: [],
      excludedDays: [],
    };
    expect(WeekBreakdownSchema.safeParse(monthly).success).toBe(false);
    expect(KmCalcBreakdownSchema.safeParse({ ...BASE, breakdown: [monthly] }).success).toBe(false);
  });

  it('rejects a bad week key, saturdaysCounted > 1 and more than one Saturday', () => {
    expect(WeekBreakdownSchema.safeParse({ ...W24, isoWeek: '2026-W5' }).success).toBe(false);
    expect(WeekBreakdownSchema.safeParse({ ...W24, isoWeek: '2027-W53' }).success).toBe(false);
    expect(WeekBreakdownSchema.safeParse({ ...W24, isoWeek: '2026-06' }).success).toBe(false);
    expect(WeekBreakdownSchema.safeParse({ ...W24, saturdaysCounted: 2 }).success).toBe(false);
    expect(WeekBreakdownSchema.safeParse({ ...W24, saturdaysCounted: 0.5 }).success).toBe(false);
    expect(
      WeekBreakdownSchema.safeParse({ ...W24, saturdayDays: ['2026-06-13', '2026-06-20'] }).success,
    ).toBe(false);
    expect(WeekBreakdownSchema.safeParse({ ...W24, weekStart: '08.06.2026' }).success).toBe(false);
    expect(WeekBreakdownSchema.safeParse({ ...W24, kmInWeek: -1 }).success).toBe(false);
  });
});

describe('KmCalcBreakdownSchema — firstDay / lastDay', () => {
  it('an envelope without firstDay/lastDay parses and backfills to null', () => {
    const parsed = KmCalcBreakdownSchema.parse(BASE);
    expect(parsed.firstDay).toBeNull();
    expect(parsed.lastDay).toBeNull();
    expect(parsed.rawTotalDays).toBe(5);
  });

  it('carries the credited boundary fractions verbatim (0 is distinct from null)', () => {
    const parsed = KmCalcBreakdownSchema.parse({
      ...BASE,
      firstDay: { date: '2026-06-07', fraction: 0 },
      lastDay: { date: '2026-06-12', fraction: 0.5 },
    });
    expect(parsed.firstDay).toEqual({ date: '2026-06-07', fraction: 0 });
    expect(parsed.lastDay).toEqual({ date: '2026-06-12', fraction: 0.5 });
  });

  it('rejects a malformed boundary date', () => {
    expect(
      KmCalcBreakdownSchema.safeParse({ ...BASE, firstDay: { date: 'not-a-date', fraction: 1 } })
        .success,
    ).toBe(false);
  });
});

describe('KmCalcBreakdownSchema — settlement fields', () => {
  it('backfills daysActive/daysTotal to totalDays, leaves mileageEffective/mileageSource undefined', () => {
    const parsed = KmCalcBreakdownSchema.parse(BASE);
    expect(parsed.daysActive).toBe(5);
    expect(parsed.daysTotal).toBe(5);
    expect(parsed.mileageEffective).toBeUndefined();
    expect(parsed.mileageSource).toBeUndefined();
  });

  it('round-trips the settlement fields and both mileage sources', () => {
    const parsed = KmCalcBreakdownSchema.parse({
      ...BASE,
      daysActive: 5,
      daysTotal: 10,
      mileageEffective: 1_500,
      mileageSource: 'board',
    });
    expect(parsed).toMatchObject({ daysActive: 5, daysTotal: 10, mileageEffective: 1_500, mileageSource: 'board' });
    expect(KmCalcBreakdownSchema.parse({ ...BASE, mileageSource: 'declared' }).mileageSource).toBe('declared');
  });

  it('rejects negative settlement values and an unknown source', () => {
    expect(KmCalcBreakdownSchema.safeParse({ ...BASE, daysActive: -1 }).success).toBe(false);
    expect(KmCalcBreakdownSchema.safeParse({ ...BASE, mileageEffective: -0.01 }).success).toBe(false);
    expect(KmCalcBreakdownSchema.safeParse({ ...BASE, mileageSource: 'proportional' }).success).toBe(false);
  });
});

describe('ClaimBoardSettlementSchema', () => {
  it('accepts what the api builds from a weekly board settlement', () => {
    const calc = calcKmGwarant({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-21',
      limits: {
        '2026-W24': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
        '2026-W25': { kmPerDay: 540, ratePerKm: 0.5 },
      },
      fallback: FALLBACK_WEEK_LIMIT,
    });
    const settlement = settleClaim({
      breakdown: calc.breakdown,
      mileage: 3_500,
      kmGuaranteed: calc.kmGuaranteed,
      ratePerKmEffective: calc.ratePerKmEffective,
      dateStart: '2026-06-08',
      dateEnd: '2026-06-21',
      board: [{ date: '2026-06-15', state: 'drove', km: 1_500 }],
    });
    const parsed = ClaimBoardSettlementSchema.parse({
      mileageEffective: settlement.mileageEffective,
      kmDifference: settlement.kmDifference,
      paymentEur: settlement.paymentEur,
      weeks: settlement.board!.weeks,
      missingDates: settlement.board!.missingDates,
      complete: settlement.board!.complete,
    });
    expect(parsed.paymentEur).toBe(600);
    expect(parsed.complete).toBe(false);
    expect(parsed.missingDates).toHaveLength(6);
    expect(parsed.weeks.map((w) => [w.isoWeek, w.mode])).toEqual([
      ['2026-W24', 'off'],
      ['2026-W25', 'active'],
    ]);
  });

  it('rejects monthly entries, an unknown mode and a malformed missing date', () => {
    const base = {
      mileageEffective: 0,
      kmDifference: 0,
      paymentEur: 0,
      weeks: [],
      missingDates: [],
      complete: true,
    };
    const week = { isoWeek: '2026-W24', mode: 'active', km: 0, daysFilled: 0, daysRequired: 0, missingDates: [] };
    expect(ClaimBoardSettlementSchema.safeParse(base).success).toBe(true);
    expect(ClaimBoardSettlementSchema.safeParse({ ...base, weeks: [week] }).success).toBe(true);
    expect(ClaimBoardSettlementSchema.safeParse({ ...base, weeks: [{ ...week, mode: 'partial' }] }).success).toBe(false);
    expect(
      ClaimBoardSettlementSchema.safeParse({
        ...base,
        weeks: [{ ...week, isoWeek: undefined, yearMonth: '2026-06' }],
      }).success,
    ).toBe(false);
    // The old `months` key is not a substitute for `weeks`.
    const { weeks: _weeks, ...withoutWeeks } = base;
    expect(ClaimBoardSettlementSchema.safeParse({ ...withoutWeeks, months: [] }).success).toBe(false);
    expect(ClaimBoardSettlementSchema.safeParse({ ...base, missingDates: ['1.06.2026'] }).success).toBe(false);
  });
});

describe('RecalcLimitsPreviewSchema', () => {
  const figures = { kmGuaranteed: 2_700, kmDifference: 700, paymentEur: 350, ratePerKmEffective: 0.5, drivenDays: 5 };
  const changedWeek = {
    isoWeek: '2026-W24',
    periodStart: '2026-06-10',
    periodEnd: '2026-06-14',
    current: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0, kmInWeek: 1_620 },
    next: { kmPerDay: 600, ratePerKm: 0.55, kmPerSaturday: 300, kmInWeek: 2_100 },
  };

  it('accepts the dry run with changed weeks and the unchanged count', () => {
    const preview = {
      changed: true,
      current: figures,
      next: { ...figures, kmGuaranteed: 3_180 },
      changedWeeks: [changedWeek],
      unchangedWeekCount: 12,
    };
    expect(RecalcLimitsPreviewSchema.parse(preview)).toEqual(preview);
  });

  it('accepts "nothing changed" (no weeks, every week unchanged)', () => {
    expect(
      RecalcLimitsPreviewSchema.safeParse({
        changed: false,
        current: figures,
        next: figures,
        changedWeeks: [],
        unchangedWeekCount: 2,
      }).success,
    ).toBe(true);
  });

  it('requires changedWeeks and a non-negative integer unchangedWeekCount', () => {
    const base = { changed: false, current: figures, next: figures, changedWeeks: [], unchangedWeekCount: 0 };
    const { changedWeeks: _cw, ...noWeeks } = base;
    const { unchangedWeekCount: _uc, ...noCount } = base;
    expect(RecalcLimitsPreviewSchema.safeParse(noWeeks).success).toBe(false);
    expect(RecalcLimitsPreviewSchema.safeParse(noCount).success).toBe(false);
    expect(RecalcLimitsPreviewSchema.safeParse({ ...base, unchangedWeekCount: -1 }).success).toBe(false);
    expect(RecalcLimitsPreviewSchema.safeParse({ ...base, unchangedWeekCount: 1.5 }).success).toBe(false);
  });

  it('rejects a changed week with a bad key or missing figures', () => {
    const base = { changed: true, current: figures, next: figures, unchangedWeekCount: 0 };
    expect(
      RecalcLimitsPreviewSchema.safeParse({ ...base, changedWeeks: [{ ...changedWeek, isoWeek: '2026-24' }] }).success,
    ).toBe(false);
    const { kmInWeek: _k, ...noKm } = changedWeek.next;
    expect(
      RecalcLimitsPreviewSchema.safeParse({ ...base, changedWeeks: [{ ...changedWeek, next: noKm }] }).success,
    ).toBe(false);
  });
});
