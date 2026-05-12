// Fixture suite for `calcKmGwarantPerMonth`.
//
// Per docs/17-migration-roadmap.md:462-526 — there is no real production
// data; expected values are computed from the GAS reference at
// `Code.gs:862` by hand (or via a one-off offline mirror script). If a
// fixture diverges from Code.gs behavior, fix the TS implementation, not
// the test.
//
// The suite covers, at minimum:
//   - 4× full-month                 (fixtures 1–4)
//   - 4× partial month              (5–8)
//   - 3× cross-month weighted rate  (9–11)
//   - 2× cross-year                 (12–13)
//   - 3× Easter exclusion           (14–16)
//   - 3× Polish/EU holidays         (17–19)
//   - 2× single-day                 (20–21)
//   - 2× empty/inverted             (22–23)
//   - 3× timeFrom/timeTo            (24–26)
//   - 3× hoursAdjusted              (27–29)
//   - 2× missing-limit fallback     (30–31)
//   - 1× three-month span           (32)
//
// Every value below was generated against a JS mirror of Code.gs:862
// (script preserved at /tmp/refcalc.cjs during development) — the GAS
// algorithm IS the canonical source for the math.

import { describe, expect, it } from 'vitest';

import {
  calcKmGwarantPerMonth,
  type KmCalcInput,
  type MonthLimit,
} from '../src/domain/km-calc';

const FALLBACK: MonthLimit = { kmPerDay: 540, ratePerKm: 0.5 };

/** All months of 2026 default to 540 km/day and 0.5 EUR/km. */
const LIMITS_2026: Record<string, MonthLimit> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const k = `2026-${m < 10 ? '0' : ''}${m}`;
    return [k, { kmPerDay: 540, ratePerKm: 0.5 }];
  }),
);

const LIMITS_2026_2027: Record<string, MonthLimit> = {
  ...LIMITS_2026,
  '2027-01': { kmPerDay: 540, ratePerKm: 0.5 },
  '2027-03': { kmPerDay: 540, ratePerKm: 0.5 },
  '2027-04': { kmPerDay: 540, ratePerKm: 0.5 },
};

/**
 * Lightweight test helper — call the engine and assert on the result
 * shape. Uses `toEqual` for the breakdown so order + numeric equality
 * is verified together.
 */
function run(
  input: Partial<KmCalcInput> & Pick<KmCalcInput, 'dateStart' | 'dateEnd'>,
) {
  return calcKmGwarantPerMonth({
    limits: LIMITS_2026,
    fallback: FALLBACK,
    ...input,
  });
}

describe('calcKmGwarantPerMonth — full-month', () => {
  it('Jan 2026 — 20 working days, weekends excluded', () => {
    const r = run({ dateStart: '2026-01-01', dateEnd: '2026-01-31' });
    expect(r.totalDays).toBe(20);
    expect(r.kmGuaranteed).toBe(10800);
    expect(r.ratePerKmEffective).toBe(0.5);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-01',
        workingDays: 20,
        kmPerDay: 540,
        ratePerKm: 0.5,
        kmInMonth: 10800,
        excludedDays: [
          { date: '2026-01-01', label: 'Nowy Rok' },
          { date: '2026-01-06', label: 'Trzech Kroli (DE/IT/AT)' },
        ],
      },
    ]);
  });

  it('Feb 2026 — 20 working days', () => {
    const r = run({ dateStart: '2026-02-01', dateEnd: '2026-02-28' });
    expect(r.totalDays).toBe(20);
    expect(r.kmGuaranteed).toBe(10800);
    expect(r.breakdown[0].workingDays).toBe(20);
  });

  it('Mar 2026 — 22 working days', () => {
    const r = run({ dateStart: '2026-03-01', dateEnd: '2026-03-31' });
    expect(r.totalDays).toBe(22);
    expect(r.kmGuaranteed).toBe(11880);
  });

  it('Jul 2026 — 21 working days (incl. 14 Jul FR holiday excluded)', () => {
    const r = run({ dateStart: '2026-07-01', dateEnd: '2026-07-31' });
    expect(r.totalDays).toBe(21);
    expect(r.kmGuaranteed).toBe(11340);
  });
});

describe('calcKmGwarantPerMonth — partial month', () => {
  it('Jan 15–31 2026 — 12 working days', () => {
    const r = run({ dateStart: '2026-01-15', dateEnd: '2026-01-31' });
    expect(r.totalDays).toBe(12);
    expect(r.kmGuaranteed).toBe(6480);
  });

  it('Jan 1–15 2026 — 9 working days (1 Jan excluded as Nowy Rok)', () => {
    const r = run({ dateStart: '2026-01-01', dateEnd: '2026-01-15' });
    expect(r.totalDays).toBe(9);
    expect(r.kmGuaranteed).toBe(4860);
  });

  it('Mar 10–20 2026 — 9 working days', () => {
    const r = run({ dateStart: '2026-03-10', dateEnd: '2026-03-20' });
    expect(r.totalDays).toBe(9);
    expect(r.kmGuaranteed).toBe(4860);
  });

  it('Feb 9–13 2026 — full work week', () => {
    const r = run({ dateStart: '2026-02-09', dateEnd: '2026-02-13' });
    expect(r.totalDays).toBe(5);
    expect(r.kmGuaranteed).toBe(2700);
  });
});

describe('calcKmGwarantPerMonth — cross-month weighted rate', () => {
  it('Jan 21 – Feb 7 2026 with 0.5 vs 0.6 EUR/km', () => {
    const r = run({
      dateStart: '2026-01-21',
      dateEnd: '2026-02-07',
      limits: {
        '2026-01': { kmPerDay: 540, ratePerKm: 0.5 },
        '2026-02': { kmPerDay: 540, ratePerKm: 0.6 },
      },
    });
    expect(r.totalDays).toBe(13);
    expect(r.kmGuaranteed).toBe(7020);
    // Weighted: (4320*0.5 + 2700*0.6) / 7020 = 0.53846… → rounded 0.538.
    expect(r.ratePerKmEffective).toBe(0.538);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-01',
        workingDays: 8,
        kmPerDay: 540,
        ratePerKm: 0.5,
        kmInMonth: 4320,
        excludedDays: [],
      },
      {
        yearMonth: '2026-02',
        workingDays: 5,
        kmPerDay: 540,
        ratePerKm: 0.6,
        kmInMonth: 2700,
        excludedDays: [],
      },
    ]);
  });

  it('Feb 23 – Mar 6 2026 with equal rates → flat 0.5', () => {
    const r = run({ dateStart: '2026-02-23', dateEnd: '2026-03-06' });
    expect(r.totalDays).toBe(10);
    expect(r.kmGuaranteed).toBe(5400);
    expect(r.ratePerKmEffective).toBe(0.5);
    expect(r.breakdown).toHaveLength(2);
  });

  it('Jun 25 – Jul 8 2026 with different kmPerDay (500 vs 600)', () => {
    const r = run({
      dateStart: '2026-06-25',
      dateEnd: '2026-07-08',
      limits: {
        '2026-06': { kmPerDay: 500, ratePerKm: 0.55 },
        '2026-07': { kmPerDay: 600, ratePerKm: 0.45 },
      },
    });
    expect(r.totalDays).toBe(10);
    expect(r.kmGuaranteed).toBe(5600);
    // (2000*0.55 + 3600*0.45) / 5600 = 0.4857… → rounded 0.486
    expect(r.ratePerKmEffective).toBe(0.486);
  });
});

describe('calcKmGwarantPerMonth — cross-year', () => {
  it('Dec 28 2026 – Jan 5 2027', () => {
    const r = run({
      dateStart: '2026-12-28',
      dateEnd: '2027-01-05',
      limits: LIMITS_2026_2027,
    });
    expect(r.totalDays).toBe(6);
    expect(r.kmGuaranteed).toBe(3240);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-12',
        workingDays: 4,
        kmPerDay: 540,
        ratePerKm: 0.5,
        kmInMonth: 2160,
        excludedDays: [],
      },
      {
        yearMonth: '2027-01',
        workingDays: 2,
        kmPerDay: 540,
        ratePerKm: 0.5,
        kmInMonth: 1080,
        excludedDays: [{ date: '2027-01-01', label: 'Nowy Rok' }],
      },
    ]);
  });

  it('Dec 21 2026 – Jan 4 2027 — Christmas window', () => {
    const r = run({
      dateStart: '2026-12-21',
      dateEnd: '2027-01-04',
      limits: LIMITS_2026_2027,
    });
    expect(r.totalDays).toBe(9);
    expect(r.kmGuaranteed).toBe(4860);
  });
});

describe('calcKmGwarantPerMonth — Easter exclusion', () => {
  it('Apr 1–10 2026 — Easter Sunday Apr 5, Good Friday Apr 3, Mon Apr 6 excluded', () => {
    const r = run({ dateStart: '2026-04-01', dateEnd: '2026-04-10' });
    // Apr 1–10 2026: weekdays would be Wed 1, Thu 2, Fri 3, Mon 6, Tue 7, Wed 8,
    // Thu 9, Fri 10 (8 days). Removing Good Friday (3) + Easter Mon (6) → 6.
    expect(r.totalDays).toBe(6);
    expect(r.kmGuaranteed).toBe(3240);
  });

  it('Mar 25 – Apr 2 2027 — Easter Mar 28, includes Good Friday Mar 26 + Mon Mar 29', () => {
    const r = run({
      dateStart: '2027-03-25',
      dateEnd: '2027-04-02',
      limits: LIMITS_2026_2027,
    });
    // Mar 25 (Thu), 26 (Fri-Good Fri), 29 (Mon-Easter Mon), 30 (Tue), 31 (Wed)
    // Apr 1 (Thu), 2 (Fri) — excluded: 26, 29 → working = 5
    expect(r.totalDays).toBe(5);
    expect(r.kmGuaranteed).toBe(2700);
  });

  it('Sep 1–15 2026 — window outside Easter, normal counting', () => {
    const r = run({ dateStart: '2026-09-01', dateEnd: '2026-09-15' });
    expect(r.totalDays).toBe(11);
    expect(r.kmGuaranteed).toBe(5940);
  });
});

describe('calcKmGwarantPerMonth — Polish / EU holidays', () => {
  it('May 1–8 2026 — 1 May excluded (Swieto Pracy)', () => {
    // Mon 4 May, Tue 5, Wed 6, Thu 7, Fri 8 → 5 days. May 1 is a Friday;
    // it's an EU ban day. May 3 is Sun (already weekend), May 4 is Mon.
    // Sat 2, Sun 3 are weekends.
    const r = run({ dateStart: '2026-05-01', dateEnd: '2026-05-08' });
    expect(r.totalDays).toBe(5);
    expect(r.kmGuaranteed).toBe(2700);
  });

  it('Nov 9–13 2026 — 11 Nov is Wed and excluded', () => {
    const r = run({ dateStart: '2026-11-09', dateEnd: '2026-11-13' });
    expect(r.totalDays).toBe(4);
    expect(r.kmGuaranteed).toBe(2160);
  });

  it('Aug 10–21 2026 — 15 Aug is Sat (weekend, no double-exclusion)', () => {
    const r = run({ dateStart: '2026-08-10', dateEnd: '2026-08-21' });
    expect(r.totalDays).toBe(10);
    expect(r.kmGuaranteed).toBe(5400);
  });
});

describe('calcKmGwarantPerMonth — single-day', () => {
  it('Mar 10 2026 (Tue) — one working day', () => {
    const r = run({ dateStart: '2026-03-10', dateEnd: '2026-03-10' });
    expect(r.totalDays).toBe(1);
    expect(r.kmGuaranteed).toBe(540);
  });

  it('Mar 7 2026 (Sat) — totalDays=0', () => {
    const r = run({ dateStart: '2026-03-07', dateEnd: '2026-03-07' });
    expect(r.totalDays).toBe(0);
    expect(r.kmGuaranteed).toBe(0);
    // The month bucket exists but with 0 days — matches Code.gs ordering.
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-03',
        workingDays: 0,
        kmPerDay: 540,
        ratePerKm: 0.5,
        kmInMonth: 0,
        excludedDays: [],
      },
    ]);
  });
});

describe('calcKmGwarantPerMonth — empty / inverted', () => {
  it('inverted range start>end → empty result with fallback rate', () => {
    const r = run({ dateStart: '2026-03-15', dateEnd: '2026-03-10' });
    expect(r.totalDays).toBe(0);
    expect(r.kmGuaranteed).toBe(0);
    expect(r.ratePerKmEffective).toBe(0.5);
    expect(r.breakdown).toEqual([]);
  });

  it('invalid ISO date string → empty result', () => {
    const r = run({ dateStart: 'not-a-date', dateEnd: '2026-03-15' });
    expect(r.totalDays).toBe(0);
    expect(r.kmGuaranteed).toBe(0);
    expect(r.breakdown).toEqual([]);
  });
});

describe('calcKmGwarantPerMonth — fractional days (timeFrom / timeTo)', () => {
  it('first day starts at 12:00 → fraction 0.5 on the first working day', () => {
    // Mar 9 (Mon, starts 12:00) → 0.5; Tue–Fri → 4 full → totalDays 4.5.
    const r = run({
      dateStart: '2026-03-09',
      dateEnd: '2026-03-13',
      timeFrom: '12:00',
    });
    expect(r.totalDays).toBe(4.5);
    expect(r.kmGuaranteed).toBe(2430);
  });

  it('last day ends at 12:00 → fraction 0.5 on the last working day', () => {
    const r = run({
      dateStart: '2026-03-09',
      dateEnd: '2026-03-13',
      timeTo: '12:00',
    });
    expect(r.totalDays).toBe(4.5);
    expect(r.kmGuaranteed).toBe(2430);
  });

  it('single-day with timeFrom and timeTo → (hStop-hStart)/24', () => {
    // Mar 10, 08:00–16:00 → 8/24 = 0.333… → rounded 0.33; 0.33 * 540 = 178.2 → 178.
    const r = run({
      dateStart: '2026-03-10',
      dateEnd: '2026-03-10',
      timeFrom: '08:00',
      timeTo: '16:00',
    });
    expect(r.totalDays).toBe(0.33);
    expect(r.kmGuaranteed).toBe(178);
  });
});

describe('calcKmGwarantPerMonth — hoursAdjusted', () => {
  it('hoursAdjusted=0 → unchanged', () => {
    const r = run({
      dateStart: '2026-03-02',
      dateEnd: '2026-03-13',
      hoursAdjusted: 0,
    });
    expect(r.totalDays).toBe(10);
    expect(r.kmGuaranteed).toBe(5400);
  });

  it('hoursAdjusted=8 → totalDays drops by 0.33', () => {
    const r = run({
      dateStart: '2026-03-02',
      dateEnd: '2026-03-13',
      hoursAdjusted: 8,
    });
    expect(r.totalDays).toBe(9.67);
    expect(r.kmGuaranteed).toBe(5222);
  });

  it('hoursAdjusted=16 → totalDays drops by 0.67', () => {
    const r = run({
      dateStart: '2026-03-02',
      dateEnd: '2026-03-13',
      hoursAdjusted: 16,
    });
    expect(r.totalDays).toBe(9.33);
    expect(r.kmGuaranteed).toBe(5038);
  });
});

describe('calcKmGwarantPerMonth — missing-month limit fallback', () => {
  it('empty limits → fallback applied for every month', () => {
    const r = run({
      dateStart: '2028-04-06',
      dateEnd: '2028-04-10',
      limits: {},
    });
    expect(r.totalDays).toBe(3);
    expect(r.kmGuaranteed).toBe(1620);
    expect(r.ratePerKmEffective).toBe(0.5);
  });

  it('partial limits — only Sep 2026 set; Oct 2026 falls back', () => {
    const r = run({
      dateStart: '2026-09-28',
      dateEnd: '2026-10-02',
      limits: { '2026-09': { kmPerDay: 540, ratePerKm: 0.5 } },
    });
    expect(r.totalDays).toBe(5);
    expect(r.kmGuaranteed).toBe(2700);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-09',
        workingDays: 3,
        kmPerDay: 540,
        ratePerKm: 0.5,
        kmInMonth: 1620,
        excludedDays: [],
      },
      {
        yearMonth: '2026-10',
        workingDays: 2,
        kmPerDay: 540,
        ratePerKm: 0.5,
        kmInMonth: 1080,
        excludedDays: [],
      },
    ]);
  });
});

describe('calcKmGwarantPerMonth — excludedDays surface', () => {
  it('Apr 1–10 2026 — surfaces Good Friday + Easter Monday with labels', () => {
    const r = run({ dateStart: '2026-04-01', dateEnd: '2026-04-10' });
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].excludedDays).toEqual([
      { date: '2026-04-03', label: 'Wielki Piatek (DE/NL)' },
      { date: '2026-04-06', label: 'Poniedzialek Wielkanocny' },
    ]);
  });

  it('May 1–8 2026 — surfaces Swieto Pracy (1 May Fri); weekends not listed', () => {
    const r = run({ dateStart: '2026-05-01', dateEnd: '2026-05-08' });
    expect(r.breakdown[0].excludedDays).toEqual([
      { date: '2026-05-01', label: 'Swieto Pracy' },
    ]);
  });

  it('Sep 1–15 2026 — no exclusions in window → empty list', () => {
    const r = run({ dateStart: '2026-09-01', dateEnd: '2026-09-15' });
    expect(r.breakdown[0].excludedDays).toEqual([]);
  });
});

describe('calcKmGwarantPerMonth — three-month span weighted rate', () => {
  it('Jan 25 – Mar 5 2026 with rates 0.5/0.6/0.7', () => {
    const r = run({
      dateStart: '2026-01-25',
      dateEnd: '2026-03-05',
      limits: {
        '2026-01': { kmPerDay: 540, ratePerKm: 0.5 },
        '2026-02': { kmPerDay: 540, ratePerKm: 0.6 },
        '2026-03': { kmPerDay: 540, ratePerKm: 0.7 },
      },
    });
    expect(r.totalDays).toBe(29);
    expect(r.kmGuaranteed).toBe(15660);
    expect(r.ratePerKmEffective).toBe(0.597);
    expect(r.breakdown.map((b) => b.yearMonth)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });
});
