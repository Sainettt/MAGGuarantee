// ISO 8601 week helpers (`src/domain/iso-week.ts`) — the week calendar of km
// limits since 2026-10-29. Weeks run Mon–Sun and belong to the year of their
// Thursday; the key is `YYYY-Www` with a two-digit week.

import { describe, expect, it } from 'vitest';

import {
  formatIsoWeekKey,
  isValidIsoWeek,
  isoWeekInfo,
  isoWeekInfoOfKey,
  isoWeekKeyOfDate,
  isoWeekMonday,
  isoWeekOfDate,
  isoWeekSaturday,
  isoWeekSunday,
  isoWeekThursdayMonth,
  isoWeeksInYear,
  isoWeeksOfYear,
  parseIsoWeekKey,
} from '../src/domain/iso-week';

describe('isoWeeksInYear', () => {
  it('53 when 1 January is a Thursday, or a Wednesday in a leap year', () => {
    expect(isoWeeksInYear(2026)).toBe(53); // Thu
    expect(isoWeeksInYear(2020)).toBe(53); // Wed, leap
    expect(isoWeeksInYear(2015)).toBe(53); // Thu
    expect(isoWeeksInYear(2032)).toBe(53); // Thu, leap
  });

  it('52 otherwise (incl. a leap year starting on Monday)', () => {
    expect(isoWeeksInYear(2021)).toBe(52);
    expect(isoWeeksInYear(2024)).toBe(52); // Mon, leap
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2027)).toBe(52);
  });

  it('71 long years in every 400-year cycle', () => {
    let long = 0;
    for (let y = 2000; y < 2400; y += 1) if (isoWeeksInYear(y) === 53) long += 1;
    expect(long).toBe(71);
  });
});

describe('formatIsoWeekKey / parseIsoWeekKey / isValidIsoWeek', () => {
  it('formats with a two-digit week', () => {
    expect(formatIsoWeekKey(2026, 5)).toBe('2026-W05');
    expect(formatIsoWeekKey(2026, 53)).toBe('2026-W53');
  });

  it('refuses weeks the year does not have', () => {
    expect(formatIsoWeekKey(2027, 53)).toBeNull();
    expect(formatIsoWeekKey(2026, 0)).toBeNull();
    expect(formatIsoWeekKey(2026, 54)).toBeNull();
    expect(formatIsoWeekKey(2026, 1.5)).toBeNull();
    expect(isValidIsoWeek(2026, 53)).toBe(true);
    expect(isValidIsoWeek(2027, 53)).toBe(false);
  });

  it('parses only the strict `YYYY-Www` shape of an existing week', () => {
    expect(parseIsoWeekKey('2026-W23')).toEqual({ isoYear: 2026, isoWeek: 23 });
    expect(parseIsoWeekKey('2026-W53')).toEqual({ isoYear: 2026, isoWeek: 53 });
    for (const bad of ['2027-W53', '2026-W00', '2026-W54', '2026-W5', '2026-w05', '2026W05', ' 2026-W05', '2026-05', '']) {
      expect(parseIsoWeekKey(bad)).toBeNull();
    }
    expect(parseIsoWeekKey(null)).toBeNull();
    expect(parseIsoWeekKey(undefined)).toBeNull();
  });

  it('round-trips every week of a year', () => {
    for (const week of isoWeeksOfYear(2026)) {
      expect(parseIsoWeekKey(week.key)).toEqual({ isoYear: 2026, isoWeek: week.isoWeek });
    }
  });
});

describe('isoWeekOfDate / isoWeekKeyOfDate', () => {
  it.each([
    ['2026-06-08', '2026-W24'],
    ['2026-06-14', '2026-W24'], // Sunday stays in its week
    ['2025-12-29', '2026-W01'], // W01 starting in December
    ['2026-01-04', '2026-W01'],
    ['2026-12-31', '2026-W53'],
    ['2027-01-03', '2026-W53'], // January days in the previous ISO year
    ['2027-01-04', '2027-W01'],
    ['2021-01-01', '2020-W53'], // 1 Jan in the previous ISO year
    ['2024-12-30', '2025-W01'],
    ['2010-01-03', '2009-W53'],
    ['2024-02-29', '2024-W09'], // leap day
  ])('%s → %s', (date, key) => {
    expect(isoWeekKeyOfDate(date)).toBe(key);
  });

  it('returns the numeric parts', () => {
    expect(isoWeekOfDate('2021-01-01')).toEqual({ isoYear: 2020, isoWeek: 53 });
  });

  it('null for an invalid date', () => {
    expect(isoWeekOfDate('2026-02-29')).toBeNull();
    expect(isoWeekKeyOfDate('2026-13-01')).toBeNull();
    expect(isoWeekKeyOfDate('2026-6-8')).toBeNull();
    expect(isoWeekKeyOfDate(null)).toBeNull();
  });
});

describe('Monday / Saturday / Sunday / Thursday month', () => {
  it('2026-W01 starts in December 2025', () => {
    expect(isoWeekMonday(2026, 1)).toBe('2025-12-29');
    expect(isoWeekSunday(2026, 1)).toBe('2026-01-04');
    expect(isoWeekThursdayMonth(2026, 1)).toBe(1);
  });

  it('2026-W53 ends in January 2027 and belongs to December', () => {
    expect(isoWeekMonday(2026, 53)).toBe('2026-12-28');
    expect(isoWeekSunday(2026, 53)).toBe('2027-01-03');
    expect(isoWeekThursdayMonth(2026, 53)).toBe(12);
  });

  it('2020-W53 holds 1 January 2021', () => {
    expect(isoWeekMonday(2020, 53)).toBe('2020-12-28');
    expect(isoWeekSunday(2020, 53)).toBe('2021-01-03');
  });

  it('a week across months belongs to the month of its Thursday', () => {
    expect(isoWeekThursdayMonth(2026, 14)).toBe(4); // 30.03–05.04, Thu 02.04
    expect(isoWeekThursdayMonth(2026, 27)).toBe(7); // 29.06–05.07, Thu 02.07
    expect(isoWeekThursdayMonth(2026, 9)).toBe(2); // 23.02–01.03, Thu 26.02
  });

  it('the Saturday of a week', () => {
    expect(isoWeekSaturday(2026, 24)).toBe('2026-06-13');
    expect(isoWeekSaturday(2026, 53)).toBe('2027-01-02');
  });

  it('null for a week that does not exist', () => {
    expect(isoWeekMonday(2027, 53)).toBeNull();
    expect(isoWeekSunday(2027, 53)).toBeNull();
    expect(isoWeekSaturday(2027, 53)).toBeNull();
    expect(isoWeekThursdayMonth(2027, 53)).toBeNull();
    expect(isoWeekInfo(2027, 53)).toBeNull();
    expect(isoWeekInfoOfKey('2027-W53')).toBeNull();
  });
});

describe('isoWeekInfo / isoWeeksOfYear', () => {
  it('one week with key + dates + Thursday month', () => {
    expect(isoWeekInfo(2026, 24)).toEqual({
      isoYear: 2026,
      isoWeek: 24,
      key: '2026-W24',
      start: '2026-06-08',
      end: '2026-06-14',
      thursdayMonth: 6,
    });
    expect(isoWeekInfoOfKey('2026-W24')).toEqual(isoWeekInfo(2026, 24));
  });

  it('2026: 53 contiguous weeks, W01 from 29.12.2025, W53 to 03.01.2027', () => {
    const weeks = isoWeeksOfYear(2026);
    expect(weeks).toHaveLength(53);
    expect(weeks[0]).toEqual({
      isoYear: 2026,
      isoWeek: 1,
      key: '2026-W01',
      start: '2025-12-29',
      end: '2026-01-04',
      thursdayMonth: 1,
    });
    expect(weeks[52]).toEqual({
      isoYear: 2026,
      isoWeek: 53,
      key: '2026-W53',
      start: '2026-12-28',
      end: '2027-01-03',
      thursdayMonth: 12,
    });
    for (let i = 1; i < weeks.length; i += 1) {
      const prevEnd = Date.parse(`${weeks[i - 1]!.end}T00:00:00Z`);
      const start = Date.parse(`${weeks[i]!.start}T00:00:00Z`);
      expect(start - prevEnd).toBe(86_400_000);
    }
    // The next year continues right after: 2027-W01 starts on 04.01.2027.
    expect(isoWeeksOfYear(2027)[0]!.start).toBe('2027-01-04');
    expect(isoWeeksOfYear(2027)).toHaveLength(52);
  });

  it('weeks per month = Thursdays in the month (December 2026: W49–W53)', () => {
    const december = isoWeeksOfYear(2026).filter((w) => w.thursdayMonth === 12);
    expect(december.map((w) => w.isoWeek)).toEqual([49, 50, 51, 52, 53]);
    const perMonth = Array.from({ length: 12 }, (_, i) =>
      isoWeeksOfYear(2026).filter((w) => w.thursdayMonth === i + 1).length,
    );
    expect(perMonth.reduce((a, b) => a + b, 0)).toBe(53);
    expect(perMonth.every((n) => n === 4 || n === 5)).toBe(true);
  });

  it('[] for a year out of range', () => {
    expect(isoWeeksOfYear(0)).toEqual([]);
    expect(isoWeeksOfYear(10_000)).toEqual([]);
    expect(isoWeeksOfYear(2026.5)).toEqual([]);
  });
});

describe('time-zone independence', () => {
  it('identical results under every process TZ', () => {
    const snapshot = (): unknown => ({
      weeks: isoWeeksOfYear(2026),
      keys: ['2021-01-01', '2025-12-29', '2026-03-29', '2026-10-25', '2027-01-03'].map(isoWeekKeyOfDate),
    });
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const baseline = snapshot();
      for (const tz of ['Europe/Warsaw', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
        process.env.TZ = tz;
        expect(snapshot()).toEqual(baseline);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
