// Cases for the calendar-day helpers added for the vehicle lifecycle model:
// `businessDateIso` / `startOfBusinessDayUtc` (Warsaw-date reduction of an
// arbitrary instant) and `calendarDaysBetween` (exact whole-day diff), plus
// `businessWallClockUtc` (Warsaw wall-clock "now" labelled UTC, UWAGI #1
// 2026-10-22). Pure — the only platform API is `Intl.DateTimeFormat`,
// deterministic across Node.

import { describe, expect, it } from 'vitest';

import {
  businessDateIso,
  businessWallClockUtc,
  calendarDaysBetween,
  startOfBusinessDayUtc,
  startOfWallClockDayUtc,
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

// UWAGI #26 (2026-10-27) — the reduction for the OTHER convention: a Warsaw
// wall-clock labelled UTC keeps its raw date part.
describe('startOfWallClockDayUtc', () => {
  it('keeps the raw date part of a wall-clock-labelled value (no Warsaw shift)', () => {
    // 23:30 typed by the weryfikator on 27.10 (CET) — stored as `…T23:30:00Z`.
    const typed = new Date('2026-10-27T23:30:00Z');
    expect(startOfWallClockDayUtc(typed).toISOString()).toBe('2026-10-27T00:00:00.000Z');
    // The true-instant reduction moves the same value to 28.10 — the UWAGI #26 bug.
    expect(startOfBusinessDayUtc(typed).toISOString()).toBe('2026-10-28T00:00:00.000Z');
  });

  it('CEST: 22:30 stays on its day', () => {
    expect(startOfWallClockDayUtc(new Date('2026-07-01T22:30:00Z')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('maps a UTC-midnight value to itself and diffs cleanly through calendarDaysBetween', () => {
    const day = startOfWallClockDayUtc(new Date('2026-07-01T22:30:00Z'));
    expect(startOfWallClockDayUtc(day).getTime()).toBe(day.getTime());
    expect(calendarDaysBetween(day, U('2026-07-16'))).toBe(15);
  });
});

describe('businessWallClockUtc', () => {
  /** Real UTC instant → Warsaw wall-clock labelled UTC, as an ISO string. */
  function wall(iso: string): string {
    return businessWallClockUtc(new Date(iso)).toISOString();
  }

  it('CET (+01:00): 10:00 UTC → 11:00 wall-clock labelled UTC', () => {
    expect(wall('2026-01-15T10:00:00Z')).toBe('2026-01-15T11:00:00.000Z');
  });

  it('CEST (+02:00): 10:00 UTC → 12:00 wall-clock labelled UTC', () => {
    expect(wall('2026-07-15T10:00:00Z')).toBe('2026-07-15T12:00:00.000Z');
  });

  it('rolls over local midnight into the NEXT calendar day', () => {
    // 22:30 UTC 21 Oct = 00:30 CEST 22 Oct.
    expect(wall('2026-10-21T22:30:00Z')).toBe('2026-10-22T00:30:00.000Z');
  });

  it('prints exact local midnight as 00 (hourCycle h23), never 24', () => {
    // 23:00 UTC 14 Jan = 00:00 CET 15 Jan.
    expect(wall('2026-01-14T23:00:00Z')).toBe('2026-01-15T00:00:00.000Z');
  });

  it('drops milliseconds (whole-second precision)', () => {
    expect(wall('2026-01-15T10:00:00.789Z')).toBe('2026-01-15T11:00:00.000Z');
  });

  describe('spring-forward 2026-03-29 (02:00 CET → 03:00 CEST at 01:00 UTC)', () => {
    it('last second before the switch is still CET: 00:59:59Z → 01:59:59', () => {
      expect(wall('2026-03-29T00:59:59Z')).toBe('2026-03-29T01:59:59.000Z');
    });

    it('first instant after the switch is CEST: 01:00:00Z → 03:00:00 (02:xx never exists)', () => {
      expect(wall('2026-03-29T01:00:00Z')).toBe('2026-03-29T03:00:00.000Z');
    });
  });

  describe('fall-back 2026-10-25 (03:00 CEST → 02:00 CET at 01:00 UTC)', () => {
    // The 02:00–02:59 local hour happens twice. Both real instants map to the
    // same wall-clock — accepted: the stored `actual*` values carry no offset
    // either, so they are equally ambiguous within that hour.
    it('first pass (CEST): 00:30Z → 02:30', () => {
      expect(wall('2026-10-25T00:30:00Z')).toBe('2026-10-25T02:30:00.000Z');
    });

    it('second pass (CET): 01:30Z → 02:30 (repeated hour)', () => {
      expect(wall('2026-10-25T01:30:00Z')).toBe('2026-10-25T02:30:00.000Z');
    });
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
