// Unit tests for the UTC-pinned wall-clock display formatters (UWAGI #26).
//
// `Delegation.actualDepartureAt` / `actualReturnAt` are Warsaw WALL-CLOCK values
// LABELLED UTC (docs/19 #16): the weryfikator types 23:30 and the api stores
// `…T23:30:00Z`. `Vehicle.lastDroveAt` holds such a value verbatim or a
// UTC-midnight km day. For all of them the calendar date IS the UTC date part,
// so `formatWallClockDate` / `formatWallClockDateTime` pin `timeZone: 'UTC'`.
//
// Machine-TZ independent: the formatters pin UTC, so their outputs are asserted
// directly; the browser-local contrast uses an explicit `Europe/Warsaw` Intl.

import { describe, expect, it } from 'vitest';

import { formatWallClockDate, formatWallClockDateTime } from './numbers';

describe('formatWallClockDate', () => {
  it('prints the UTC date part of a late-evening wall-clock value (no next-day shift)', () => {
    expect(formatWallClockDate('2026-10-27T23:30:00Z')).toBe('27.10.2026');
  });

  it('prints the UTC date part across a month boundary in CEST (+02:00)', () => {
    // 22:30 wall-clock on 1 July — a Warsaw browser would print 02.07.2026.
    expect(formatWallClockDate('2026-07-01T22:30:00Z')).toBe('01.07.2026');
  });

  it('prints a date-only `YYYY-MM-DD` value verbatim', () => {
    expect(formatWallClockDate('2026-07-15')).toBe('15.07.2026');
  });

  it('prints a UTC-midnight date value verbatim', () => {
    expect(formatWallClockDate('2026-07-15T00:00:00.000Z')).toBe('15.07.2026');
  });

  it('returns an em-dash for null / undefined / empty', () => {
    expect(formatWallClockDate(null)).toBe('—');
    expect(formatWallClockDate(undefined)).toBe('—');
    expect(formatWallClockDate('')).toBe('—');
  });

  it('falls back to the raw date slice for an unparseable value', () => {
    expect(formatWallClockDate('not-a-date-at-all')).toBe('not-a-date');
  });
});

describe('formatWallClockDateTime', () => {
  it('prints the raw UTC date and clock of a wall-clock value', () => {
    expect(formatWallClockDateTime('2026-10-27T23:30:00Z')).toBe('27.10.2026, 23:30');
  });

  it('prints the raw clock in summer time too (no +02:00 re-applied)', () => {
    expect(formatWallClockDateTime('2026-07-01T22:30:00Z')).toBe('01.07.2026, 22:30');
  });

  it('returns an em-dash for null / undefined / empty', () => {
    expect(formatWallClockDateTime(null)).toBe('—');
    expect(formatWallClockDateTime(undefined)).toBe('—');
    expect(formatWallClockDateTime('')).toBe('—');
  });

  it('falls back to the raw `YYYY-MM-DD HH:mm` slice for an unparseable value', () => {
    expect(formatWallClockDateTime('2026-13-45T99:99:00Z')).toBe('2026-13-45 99:99');
  });
});

describe('why the UTC-pinned formatters exist', () => {
  it('browser-local (Warsaw) rendering of a 23:30 wall-clock value lands on the next day', () => {
    // What `formatDateFull` / `formatDateTime` print in a Warsaw browser —
    // they use browser-local Intl (no `timeZone`), so the +01:00 (CET) offset
    // is re-applied on top of a value that was already a Warsaw wall-clock.
    const warsawDate = new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Warsaw',
    });
    const warsawDateTime = new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Warsaw',
    });
    const iso = '2026-10-27T23:30:00Z';

    expect(warsawDate.format(new Date(iso))).toBe('28.10.2026');
    expect(warsawDateTime.format(new Date(iso))).toBe('28.10.2026, 00:30');
    expect(formatWallClockDate(iso)).toBe('27.10.2026');
  });
});
