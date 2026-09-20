// Wire-contract guard for `KmCalcBreakdownSchema` — the shape persisted on
// `Claim.breakdown` (JSONB) and returned by `/preview` + `/claims/:nrZgl`.
//
// Focus: the newly-added `firstDay` / `lastDay` boundary-day fields must be
// backward-compatible with legacy persisted rows (written before the fields
// existed) — those rows omit the keys and MUST still parse, backfilling to
// `null`. New rows carry the `{ date, fraction }` object and round-trip.

import { describe, expect, it } from 'vitest';

import { KmCalcBreakdownSchema } from '../src/schemas/claims';

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
