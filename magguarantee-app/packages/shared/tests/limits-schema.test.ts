// Wire-contract guard for the km limit schemas — per ISO week since
// 2026-10-29 (docs/13-api-design.md «Limits — `/api/v1/limits`»).
//
// Feature «wyłączane limity gwarancji» (2026-09-20): `0` is a legal,
// meaningful value ("guarantee switched off"), so the write schemas are
// `.nonnegative()`, not `.positive()`. Since there is NO DB-level CHECK on
// `weekly_limits`, these schemas are the ONLY thing standing between the UI and
// a negative guarantee — hence the explicit negative-rejection fixtures on BOTH
// write paths (`PUT /limits/:isoWeek` and `POST /limits/bulk`), plus the week
// addressing: a week the ISO year does not have (W53 of a 52-week year) is a 400.

import { describe, expect, it } from 'vitest';

import {
  BulkUpdateWeeklyLimitsSchema,
  IsoWeekParamSchema,
  ListWeeklyLimitsFiltersSchema,
  UpdateWeeklyLimitSchema,
  WeeklyLimitDtoSchema,
} from '../src/schemas/limits';

describe('UpdateWeeklyLimitSchema', () => {
  it('accepts an all-zero payload and single zero fields', () => {
    expect(
      UpdateWeeklyLimitSchema.parse({ kmPerDay: 0, ratePerKm: 0, kmPerSaturday: 0 }),
    ).toEqual({ kmPerDay: 0, ratePerKm: 0, kmPerSaturday: 0 });
    expect(UpdateWeeklyLimitSchema.parse({ kmPerSaturday: 0 })).toEqual({ kmPerSaturday: 0 });
  });

  it('coerces numeric strings from the form layer', () => {
    expect(UpdateWeeklyLimitSchema.parse({ kmPerDay: '0', ratePerKm: '0.52' })).toEqual({
      kmPerDay: 0,
      ratePerKm: 0.52,
    });
  });

  it('rejects negatives on every field and an empty payload', () => {
    expect(() => UpdateWeeklyLimitSchema.parse({ kmPerDay: -1 })).toThrow();
    expect(() => UpdateWeeklyLimitSchema.parse({ ratePerKm: -0.01 })).toThrow();
    expect(() => UpdateWeeklyLimitSchema.parse({ kmPerSaturday: -270 })).toThrow();
    expect(() => UpdateWeeklyLimitSchema.parse({})).toThrow();
  });
});

describe('BulkUpdateWeeklyLimitsSchema', () => {
  const BASE = { isoYear: 2026, weeks: [10, 11, 12] };

  it('accepts all 53 weeks of 2026 (a 53-week ISO year)', () => {
    const parsed = BulkUpdateWeeklyLimitsSchema.parse({
      isoYear: 2026,
      weeks: Array.from({ length: 53 }, (_, i) => i + 1),
      kmPerDay: 0,
      kmPerSaturday: 0,
    });
    expect(parsed.weeks).toHaveLength(53);
    expect(parsed.kmPerDay).toBe(0);
    expect(parsed.ratePerKm).toBeUndefined(); // "bez zmian"
  });

  it('coerces numeric strings (isoYear, weeks, values)', () => {
    expect(
      BulkUpdateWeeklyLimitsSchema.parse({ isoYear: '2026', weeks: ['10', '11'], ratePerKm: '0.52' }),
    ).toEqual({ isoYear: 2026, weeks: [10, 11], ratePerKm: 0.52 });
  });

  it('rejects W53 of a 52-week year, pointing at the offending entry', () => {
    const res = BulkUpdateWeeklyLimitsSchema.safeParse({
      isoYear: 2027,
      weeks: [52, 53],
      kmPerDay: 0,
    });
    expect(res.success).toBe(false);
    expect(res.error!.issues.map((i) => i.path)).toEqual([['weeks', 1]]);
    expect(
      BulkUpdateWeeklyLimitsSchema.safeParse({ isoYear: 2026, weeks: [53], kmPerDay: 0 }).success,
    ).toBe(true);
  });

  it('rejects an empty / duplicated / out-of-range week list', () => {
    for (const weeks of [[], [10, 10], [0], [54], [1.5]]) {
      expect(() => BulkUpdateWeeklyLimitsSchema.parse({ isoYear: 2026, weeks, kmPerDay: 0 })).toThrow();
    }
  });

  it('rejects negatives — same guard as the single-week path', () => {
    expect(() => BulkUpdateWeeklyLimitsSchema.parse({ ...BASE, kmPerDay: -1 })).toThrow();
    expect(() => BulkUpdateWeeklyLimitsSchema.parse({ ...BASE, ratePerKm: -0.5 })).toThrow();
    expect(() => BulkUpdateWeeklyLimitsSchema.parse({ ...BASE, kmPerSaturday: -1 })).toThrow();
  });

  it('requires at least one value (a week list alone is a no-op)', () => {
    expect(() => BulkUpdateWeeklyLimitsSchema.parse(BASE)).toThrow();
  });

  it('rejects an out-of-range year and unknown keys (incl. the monthly `year` / `months`)', () => {
    expect(() => BulkUpdateWeeklyLimitsSchema.parse({ ...BASE, isoYear: 1999, kmPerDay: 1 })).toThrow();
    expect(() => BulkUpdateWeeklyLimitsSchema.parse({ ...BASE, kmPerDay: 1, nope: true })).toThrow();
    expect(() =>
      BulkUpdateWeeklyLimitsSchema.parse({ year: 2026, months: [1], kmPerDay: 1 }),
    ).toThrow();
  });
});

describe('IsoWeekParamSchema', () => {
  it('accepts `YYYY-Www` of an existing week', () => {
    expect(IsoWeekParamSchema.parse('2026-W05')).toBe('2026-W05');
    expect(IsoWeekParamSchema.parse('2026-W53')).toBe('2026-W53');
    expect(IsoWeekParamSchema.parse('2020-W53')).toBe('2020-W53');
  });

  it('rejects W53 of a 52-week year, a one-digit week and other shapes', () => {
    for (const bad of ['2027-W53', '2026-W00', '2026-W54', '2026-W5', '2026-w05', '2026-05', '2026W05']) {
      expect(IsoWeekParamSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('ListWeeklyLimitsFiltersSchema / WeeklyLimitDtoSchema', () => {
  it('coerces the ISO year and is strict', () => {
    expect(ListWeeklyLimitsFiltersSchema.parse({ year: '2026' })).toEqual({ year: 2026 });
    expect(() => ListWeeklyLimitsFiltersSchema.parse({ year: '2026', week: '5' })).toThrow();
    expect(() => ListWeeklyLimitsFiltersSchema.parse({ year: '1999' })).toThrow();
  });

  it('read rows keep NULL distinct from 0', () => {
    const row = {
      id: '0b9f7c1e-6a37-4c55-9f4f-3e0f1f2b8a11',
      isoYear: 2026,
      isoWeek: 53,
      kmPerDay: null,
      ratePerKm: 0,
      kmPerSaturday: null,
      createdAt: '2026-10-29T10:00:00.000Z',
      updatedAt: '2026-10-29T10:00:00.000Z',
    };
    expect(WeeklyLimitDtoSchema.parse(row)).toEqual(row);
    expect(WeeklyLimitDtoSchema.safeParse({ ...row, isoWeek: 54 }).success).toBe(false);
    expect(WeeklyLimitDtoSchema.safeParse({ ...row, isoWeek: 0 }).success).toBe(false);
  });
});
