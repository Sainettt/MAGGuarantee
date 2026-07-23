// Cases for the calendar-day helpers added for the vehicle lifecycle model:
// `businessDateIso` / `startOfBusinessDayUtc` (Warsaw-date reduction of an
// arbitrary instant) and `calendarDaysBetween` (exact whole-day diff). Pure —
// the only platform API is `Intl.DateTimeFormat`, deterministic across Node.

import { describe, expect, it } from 'vitest';

import {
  businessDateIso,
  calendarDaysBetween,
  startOfBusinessDayUtc,
} from '../src/domain/business-date';

/** `YYYY-MM-DD` → UTC-midnight Date. */
function U(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, d as number));
}

describe('businessDateIso', () => {
  it('reduces a UTC-midnight date to the same Warsaw calendar day (summer, CEST)', () => {
    expect(businessDateIso(U('2026-07-01'))).toBe('2026-07-01');
  });

  it('reduces a UTC-midnight date to the same Warsaw calendar day (winter, CET)', () => {
    expect(businessDateIso(U('2026-01-01'))).toBe('2026-01-01');
  });

  it('folds a late-evening UTC instant into the NEXT Warsaw day', () => {
    // 23:00 UTC 2026-07-01 = 01:00 CEST 2026-07-02.
    expect(businessDateIso(new Date('2026-07-01T23:00:00Z'))).toBe('2026-07-02');
  });

  it('keeps a midday UTC instant on the same Warsaw day', () => {
    expect(businessDateIso(new Date('2026-07-01T10:00:00Z'))).toBe('2026-07-01');
  });
});

describe('startOfBusinessDayUtc', () => {
  it('returns the UTC-midnight anchor of the instant’s Warsaw day', () => {
    const anchor = startOfBusinessDayUtc(new Date('2026-07-01T23:00:00Z'));
    expect(anchor.toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });
});

describe('calendarDaysBetween', () => {
  it('same Warsaw day → 0 (regardless of time-of-day)', () => {
    expect(
      calendarDaysBetween(
        new Date('2026-07-01T06:00:00Z'),
        new Date('2026-07-01T20:00:00Z'),
      ),
    ).toBe(0);
  });

  it('counts exact forward days', () => {
    expect(calendarDaysBetween(U('2026-07-16'), U('2026-07-30'))).toBe(14);
  });

  it('is negative when `to` precedes `from`', () => {
    expect(calendarDaysBetween(U('2026-07-30'), U('2026-07-16'))).toBe(-14);
  });

  it('spans a month boundary correctly', () => {
    expect(calendarDaysBetween(U('2026-07-30'), U('2026-08-02'))).toBe(3);
  });

  it('spans a year boundary correctly', () => {
    expect(calendarDaysBetween(U('2025-12-30'), U('2026-01-02'))).toBe(3);
  });

  it('crosses the spring DST transition without off-by-one', () => {
    // Poland springs forward 2026-03-29. Two UTC-midnight dates around it still
    // diff to exact calendar days (anchors are UTC midnight, offset-agnostic).
    expect(calendarDaysBetween(U('2026-03-28'), U('2026-03-31'))).toBe(3);
  });
});
