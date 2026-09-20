// Wire-contract guard for the MonthlyLimit write schemas.
//
// Feature «wyłączane limity gwarancji» (2026-09-20): `0` became a legal,
// meaningful value ("guarantee switched off for this month"), so the write
// schemas moved from `.positive()` to `.nonnegative()`. Since there is NO
// DB-level CHECK on `monthly_limits` (no migration shipped with the feature),
// these schemas are the ONLY thing standing between the UI and a negative
// guarantee — hence the explicit negative-rejection fixtures on BOTH write
// paths (`PUT /limits/:yearMonth` and `POST /limits/bulk`).

import { describe, expect, it } from 'vitest';

import {
  BulkUpdateMonthlyLimitsSchema,
  UpdateMonthlyLimitSchema,
} from '../src/schemas/limits';

describe('UpdateMonthlyLimitSchema', () => {
  it('accepts an all-zero payload (the "switch the month off" case)', () => {
    const parsed = UpdateMonthlyLimitSchema.parse({
      kmPerDay: 0,
      ratePerKm: 0,
      kmPerSaturday: 0,
    });
    expect(parsed).toEqual({ kmPerDay: 0, ratePerKm: 0, kmPerSaturday: 0 });
  });

  it('accepts a single zero field (partial switch-off)', () => {
    expect(UpdateMonthlyLimitSchema.parse({ kmPerDay: 0 })).toEqual({
      kmPerDay: 0,
    });
    expect(UpdateMonthlyLimitSchema.parse({ kmPerSaturday: 0 })).toEqual({
      kmPerSaturday: 0,
    });
  });

  it('still coerces numeric strings from the form layer', () => {
    expect(UpdateMonthlyLimitSchema.parse({ kmPerDay: '0' })).toEqual({
      kmPerDay: 0,
    });
    expect(UpdateMonthlyLimitSchema.parse({ ratePerKm: '0.52' })).toEqual({
      ratePerKm: 0.52,
    });
  });

  it('rejects negatives on every field', () => {
    expect(() => UpdateMonthlyLimitSchema.parse({ kmPerDay: -1 })).toThrow();
    expect(() => UpdateMonthlyLimitSchema.parse({ ratePerKm: -0.01 })).toThrow();
    expect(() =>
      UpdateMonthlyLimitSchema.parse({ kmPerSaturday: -270 }),
    ).toThrow();
  });

  it('still requires at least one field', () => {
    expect(() => UpdateMonthlyLimitSchema.parse({})).toThrow();
  });
});

describe('BulkUpdateMonthlyLimitsSchema', () => {
  const BASE = { year: 2026, months: [1, 2, 3] };

  it('accepts a whole-year switch-off', () => {
    const parsed = BulkUpdateMonthlyLimitsSchema.parse({
      year: 2026,
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      kmPerDay: 0,
      kmPerSaturday: 0,
    });
    expect(parsed.months).toHaveLength(12);
    expect(parsed.kmPerDay).toBe(0);
    expect(parsed.ratePerKm).toBeUndefined(); // "bez zmian"
  });

  it('rejects an empty / duplicated / out-of-range month list', () => {
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({ year: 2026, months: [], kmPerDay: 0 }),
    ).toThrow();
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({
        year: 2026,
        months: [1, 1],
        kmPerDay: 0,
      }),
    ).toThrow();
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({
        year: 2026,
        months: [0],
        kmPerDay: 0,
      }),
    ).toThrow();
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({
        year: 2026,
        months: [13],
        kmPerDay: 0,
      }),
    ).toThrow();
  });

  it('rejects negatives — same guard as the single-month path', () => {
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({ ...BASE, kmPerDay: -1 }),
    ).toThrow();
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({ ...BASE, ratePerKm: -0.5 }),
    ).toThrow();
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({ ...BASE, kmPerSaturday: -1 }),
    ).toThrow();
  });

  it('requires at least one value (a month list alone is a no-op)', () => {
    expect(() => BulkUpdateMonthlyLimitsSchema.parse(BASE)).toThrow();
  });

  it('rejects an out-of-range year and unknown keys', () => {
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({ ...BASE, year: 1999, kmPerDay: 1 }),
    ).toThrow();
    expect(() =>
      BulkUpdateMonthlyLimitsSchema.parse({
        ...BASE,
        kmPerDay: 1,
        nope: true,
      }),
    ).toThrow();
  });
});
