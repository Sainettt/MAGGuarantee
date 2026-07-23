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
 * Every month of 2026 with the odd-Saturday guarantee ON: kmPerSaturday = 270
 * (the seed value db-agent засидил on 2026). Mirrors the production seed so the
 * odd-Saturday fixtures below exercise the exact demoable configuration.
 */
const LIMITS_2026_SAT: Record<string, MonthLimit> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const k = `2026-${m < 10 ? '0' : ''}${m}`;
    return [k, { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 }];
  }),
);

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
    // No `hoursAdjusted` → raw equals adjusted total.
    expect(r.rawTotalDays).toBe(20);
    expect(r.kmGuaranteed).toBe(10800);
    expect(r.ratePerKmEffective).toBe(0.5);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-01',
        workingDays: 20,
        kmPerDay: 540,
        ratePerKm: 0.5,
        // Feature OFF (LIMITS_2026 has no kmPerSaturday ⇒ 0) — Saturdays fully
        // excluded, so all three Saturday fields collapse to 0 and totals are
        // unchanged from the pre-feature behavior.
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 10800,
        saturdayDays: [],
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
    expect(r.rawTotalDays).toBe(20);
    expect(r.kmGuaranteed).toBe(10800);
    expect(r.breakdown[0].workingDays).toBe(20);
  });

  it('Mar 2026 — 22 working days', () => {
    const r = run({ dateStart: '2026-03-01', dateEnd: '2026-03-31' });
    expect(r.totalDays).toBe(22);
    expect(r.rawTotalDays).toBe(22);
    expect(r.kmGuaranteed).toBe(11880);
  });

  it('Jul 2026 — 21 working days (incl. 14 Jul FR holiday excluded)', () => {
    const r = run({ dateStart: '2026-07-01', dateEnd: '2026-07-31' });
    expect(r.totalDays).toBe(21);
    expect(r.rawTotalDays).toBe(21);
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
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 4320,
        saturdayDays: [],
        excludedDays: [],
      },
      {
        yearMonth: '2026-02',
        workingDays: 5,
        kmPerDay: 540,
        ratePerKm: 0.6,
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 2700,
        saturdayDays: [],
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
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 2160,
        saturdayDays: [],
        excludedDays: [],
      },
      {
        yearMonth: '2027-01',
        workingDays: 2,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 1080,
        saturdayDays: [],
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
        // Feature OFF (kmPerSaturday ⇒ 0): the lone Saturday is silently
        // skipped — no day, no km, no excludedDays entry, no saturdayDays entry.
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 0,
        saturdayDays: [],
        excludedDays: [],
      },
    ]);
  });
});

describe('calcKmGwarantPerMonth — empty / inverted', () => {
  it('inverted range start>end → empty result with fallback rate', () => {
    const r = run({ dateStart: '2026-03-15', dateEnd: '2026-03-10' });
    expect(r.totalDays).toBe(0);
    // Early-return branch must also publish rawTotalDays so the UI never
    // sees `undefined` on the empty-period path.
    expect(r.rawTotalDays).toBe(0);
    expect(r.kmGuaranteed).toBe(0);
    expect(r.ratePerKmEffective).toBe(0.5);
    expect(r.breakdown).toEqual([]);
  });

  it('invalid ISO date string → empty result', () => {
    const r = run({ dateStart: 'not-a-date', dateEnd: '2026-03-15' });
    expect(r.totalDays).toBe(0);
    expect(r.rawTotalDays).toBe(0);
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
  it('hoursAdjusted=0 → unchanged (rawTotalDays === totalDays)', () => {
    const r = run({
      dateStart: '2026-03-02',
      dateEnd: '2026-03-13',
      hoursAdjusted: 0,
    });
    expect(r.totalDays).toBe(10);
    // No correction → raw mirrors adjusted exactly. UI collapses to a single
    // `<HoursReadout>` value when these match.
    expect(r.rawTotalDays).toBe(10);
    expect(r.kmGuaranteed).toBe(5400);
  });

  it('hoursAdjusted=8 → totalDays drops by 0.33; rawTotalDays unchanged', () => {
    const r = run({
      dateStart: '2026-03-02',
      dateEnd: '2026-03-13',
      hoursAdjusted: 8,
    });
    expect(r.totalDays).toBe(9.67);
    // Raw (pre-Korekta) stays at the full 10 working days the period would
    // have produced — UI renders `240,00 h surowych / 232,08 h zaliczonych`.
    expect(r.rawTotalDays).toBe(10);
    // round2(hoursAdjusted/24) = 0.33 — the exact gap between raw and adjusted.
    expect(r.rawTotalDays - r.totalDays).toBeCloseTo(0.33, 2);
    expect(r.kmGuaranteed).toBe(5222);
  });

  it('hoursAdjusted=16 → totalDays drops by 0.67; rawTotalDays unchanged', () => {
    const r = run({
      dateStart: '2026-03-02',
      dateEnd: '2026-03-13',
      hoursAdjusted: 16,
    });
    expect(r.totalDays).toBe(9.33);
    expect(r.rawTotalDays).toBe(10);
    // round2(16/24) = 0.67.
    expect(r.rawTotalDays - r.totalDays).toBeCloseTo(0.67, 2);
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
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 1620,
        saturdayDays: [],
        excludedDays: [],
      },
      {
        yearMonth: '2026-10',
        workingDays: 2,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 1080,
        saturdayDays: [],
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

// ─── Odd-Saturday guarantee (kmPerSaturday > 0) ──────────────────
//
// Business rules (fixed): a "qualifying" Saturday is the 1st/3rd/5th Saturday
// of the CALENDAR month (ordinal = floor((dayOfMonth-1)/7)+1; qualifies when
// ordinal is odd). Independent of the claim's start date; resets on the month
// boundary. Feature is OPT-IN per month: kmPerSaturday>0 turns it ON, ≤0/absent
// keeps Saturdays fully excluded (legacy behavior). A qualifying Saturday is a
// WHOLE day (never fractioned by timeFrom/timeTo), priced at the month's
// ratePerKm; one that falls on an EU-ban/holiday is NOT paid and surfaced in
// excludedDays instead. Every expectation below is computed by hand from these
// rules. Reference 2026 anchors: Jan 1 = Thu, Feb 1 = Sun, Aug 1 = Sat.
describe('calcKmGwarantPerMonth — odd-Saturday guarantee', () => {
  it('Feb 2026 full — 4-Saturday month, qualifies 1st (7th) + 3rd (21st) → 2 counted', () => {
    // Weekdays: 20 (Feb has no bans). Saturdays: 7(ord1✓),14(ord2),21(ord3✓),
    // 28(ord4) → 2 qualify. km: 20*540=10800 weekday + 2*270=540 sat = 11340.
    const r = run({ dateStart: '2026-02-01', dateEnd: '2026-02-28', limits: LIMITS_2026_SAT });
    expect(r.rawTotalDays).toBe(22); // 20 weekday + 2 Saturday
    expect(r.totalDays).toBe(22);
    expect(r.kmGuaranteed).toBe(11340);
    expect(r.ratePerKmEffective).toBe(0.5);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-02',
        workingDays: 20, // WEEKDAY days only
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 2,
        kmPerSaturday: 270,
        kmFromSaturdays: 540,
        kmInMonth: 11340,
        saturdayDays: ['2026-02-07', '2026-02-21'],
        excludedDays: [],
      },
    ]);
  });

  it('Jan 2026 full — 5-Saturday month, qualifies 1st/3rd/5th (3,17,31) → 3 counted', () => {
    // Weekdays: 20 (Jan 1 Nowy Rok + Jan 6 Trzech Kroli dropped). Saturdays:
    // 3(ord1✓),10(2),17(ord3✓),24(4),31(ord5✓) → 3 qualify (none on a ban).
    // km: 20*540=10800 + 3*270=810 = 11610.
    const r = run({ dateStart: '2026-01-01', dateEnd: '2026-01-31', limits: LIMITS_2026_SAT });
    expect(r.rawTotalDays).toBe(23); // 20 weekday + 3 Saturday
    expect(r.totalDays).toBe(23);
    expect(r.kmGuaranteed).toBe(11610);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-01',
        workingDays: 20,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 3,
        kmPerSaturday: 270,
        kmFromSaturdays: 810,
        kmInMonth: 11610,
        saturdayDays: ['2026-01-03', '2026-01-17', '2026-01-31'],
        excludedDays: [
          { date: '2026-01-01', label: 'Nowy Rok' },
          { date: '2026-01-06', label: 'Trzech Kroli (DE/IT/AT)' },
        ],
      },
    ]);
  });

  it('Aug 2026 full — qualifying Saturday on a ban (15 Aug) → excludedDays, not paid, not counted', () => {
    // Aug 1 = Sat. Saturdays: 1(ord1✓),8(2),15(ord3✓ BUT Wniebowziecie NMP
    // ban),22(4),29(ord5✓). Only Aug 1 + Aug 29 counted; Aug 15 → excludedDays.
    // Weekdays: 21 (no weekday bans in Aug). km: 21*540=11340 + 2*270=540 = 11880.
    const r = run({ dateStart: '2026-08-01', dateEnd: '2026-08-31', limits: LIMITS_2026_SAT });
    expect(r.rawTotalDays).toBe(23); // 21 weekday + 2 Saturday (Aug 15 not counted)
    expect(r.totalDays).toBe(23);
    expect(r.kmGuaranteed).toBe(11880);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-08',
        workingDays: 21,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 2,
        kmPerSaturday: 270,
        kmFromSaturdays: 540,
        kmInMonth: 11880,
        // Aug 15 (qualifying but on a ban) is NOT here — it went to excludedDays.
        saturdayDays: ['2026-08-01', '2026-08-29'],
        // The qualifying Saturday that hit the holiday is surfaced here (with
        // its label) — the ONLY way a Saturday reaches excludedDays.
        excludedDays: [{ date: '2026-08-15', label: 'Wniebowziecie NMP' }],
      },
    ]);
  });

  it('cross-month ordinal reset (Jan 24 – Feb 8 2026): Jan 24 ord4 skipped, Jan 31 ord5 ✓, Feb 7 ord1 ✓', () => {
    // Ordinal restarts at the month boundary: Feb 7 is Feb's 1st Saturday (✓)
    // even though it is the very next Saturday after Jan 31 (✓). Jan 24 is
    // Jan's 4th Saturday (even) → skipped. Weekdays: Jan 26–30 (5), Feb 2–6 (5).
    const r = run({ dateStart: '2026-01-24', dateEnd: '2026-02-08', limits: LIMITS_2026_SAT });
    expect(r.rawTotalDays).toBe(12); // 10 weekday + 2 Saturday
    expect(r.totalDays).toBe(12);
    expect(r.kmGuaranteed).toBe(5940); // 2970 + 2970
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-01',
        workingDays: 5,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 1, // Jan 31 only (Jan 24 ord4 skipped)
        kmPerSaturday: 270,
        kmFromSaturdays: 270,
        kmInMonth: 2970,
        saturdayDays: ['2026-01-31'],
        excludedDays: [],
      },
      {
        yearMonth: '2026-02',
        workingDays: 5,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 1, // Feb 7 (ordinal reset to 1)
        kmPerSaturday: 270,
        kmFromSaturdays: 270,
        kmInMonth: 2970,
        saturdayDays: ['2026-02-07'],
        excludedDays: [],
      },
    ]);
  });

  it('single-day qualifying Saturday with timeFrom/timeTo → whole day, no proportion', () => {
    // Feb 7 2026 (Sat, ord1). Even with an 8h window the Saturday counts as a
    // WHOLE day (1), never fractioned. km: 0 weekday + 1*270 = 270.
    const r = run({
      dateStart: '2026-02-07',
      dateEnd: '2026-02-07',
      timeFrom: '08:00',
      timeTo: '16:00',
      limits: LIMITS_2026_SAT,
    });
    expect(r.rawTotalDays).toBe(1);
    expect(r.totalDays).toBe(1);
    expect(r.kmGuaranteed).toBe(270);
    expect(r.ratePerKmEffective).toBe(0.5);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-02',
        workingDays: 0,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 1,
        kmPerSaturday: 270,
        kmFromSaturdays: 270,
        kmInMonth: 270,
        saturdayDays: ['2026-02-07'],
        excludedDays: [],
      },
    ]);
  });

  it('period edge: timeFrom fractions the first WEEKDAY (0.5) while the Saturday stays whole', () => {
    // Feb 6 (Fri, first, 12:00 → 0.5) + Feb 7 (Sat, ord1 ✓, whole 1) + Feb 8
    // (Sun skip) + Feb 9 (Mon, last, 1). Weekday raw = 1.5, Saturday = 1.
    // km: round(1.5*540)=810 weekday + 270 sat = 1080.
    const r = run({
      dateStart: '2026-02-06',
      dateEnd: '2026-02-09',
      timeFrom: '12:00',
      limits: LIMITS_2026_SAT,
    });
    expect(r.rawTotalDays).toBe(2.5); // 1.5 weekday + 1 Saturday
    expect(r.totalDays).toBe(2.5);
    expect(r.kmGuaranteed).toBe(1080);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-02',
        workingDays: 1.5,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 1,
        kmPerSaturday: 270,
        kmFromSaturdays: 270,
        kmInMonth: 1080,
        saturdayDays: ['2026-02-07'],
        excludedDays: [],
      },
    ]);
  });

  it('opt-in gate: kmPerSaturday = 0 → Saturdays fully excluded (legacy behavior)', () => {
    // Same Feb 2026 window as the 4-Saturday fixture, but the limit turns the
    // feature OFF. Result must be identical to the pre-feature Feb (20 days,
    // 10800 km) — no Saturday day, km, or excludedDays entry.
    const r = run({
      dateStart: '2026-02-01',
      dateEnd: '2026-02-28',
      limits: { '2026-02': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 } },
    });
    expect(r.totalDays).toBe(20);
    expect(r.rawTotalDays).toBe(20);
    expect(r.kmGuaranteed).toBe(10800);
    expect(r.breakdown).toEqual([
      {
        yearMonth: '2026-02',
        workingDays: 20,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 10800,
        saturdayDays: [],
        excludedDays: [],
      },
    ]);
  });

  it('drivenDays grows by EXACTLY the number of qualifying Saturdays (feature off vs on)', () => {
    const off = run({
      dateStart: '2026-02-01',
      dateEnd: '2026-02-28',
      limits: { '2026-02': { kmPerDay: 540, ratePerKm: 0.5 } }, // kmPerSaturday absent ⇒ 0
    });
    const on = run({ dateStart: '2026-02-01', dateEnd: '2026-02-28', limits: LIMITS_2026_SAT });
    // Feb 2026 has exactly 2 qualifying Saturdays (7, 21).
    expect(on.totalDays - off.totalDays).toBe(2);
    expect(on.rawTotalDays - off.rawTotalDays).toBe(2);
    // Weekday-derived km is untouched; the delta is pure Saturday km.
    expect(on.kmGuaranteed - off.kmGuaranteed).toBe(540); // 2 * 270
    expect(on.breakdown[0].saturdaysCounted).toBe(2);
    expect(on.breakdown[0].saturdayDays).toEqual(['2026-02-07', '2026-02-21']);
    expect(off.breakdown[0].saturdaysCounted).toBe(0);
    expect(off.breakdown[0].saturdayDays).toEqual([]);
  });

  it('per-month kmInMonth == weekday km + Saturday km, and Σ kmInMonth == kmGuaranteed', () => {
    const r = run({ dateStart: '2026-01-24', dateEnd: '2026-02-08', limits: LIMITS_2026_SAT });
    let sum = 0;
    for (const b of r.breakdown) {
      const kmWeekday = Math.round(b.workingDays * b.kmPerDay);
      expect(b.kmInMonth).toBe(kmWeekday + b.kmFromSaturdays);
      expect(b.kmFromSaturdays).toBe(Math.round(b.saturdaysCounted * b.kmPerSaturday));
      // Invariant: the credited-Saturday date list length equals the count,
      // and every date is a Saturday (dow 6) in ascending order.
      expect(b.saturdayDays).toHaveLength(b.saturdaysCounted);
      const ascending = [...b.saturdayDays].sort();
      expect(b.saturdayDays).toEqual(ascending);
      for (const iso of b.saturdayDays) {
        const [y, m, d] = iso.split('-').map(Number);
        expect(new Date(y, m - 1, d).getDay()).toBe(6);
      }
      sum += b.kmInMonth;
    }
    expect(sum).toBe(r.kmGuaranteed);
  });

  it('hoursAdjusted shrinks only weekday days; qualifying Saturdays stay whole', () => {
    // Feb 2026 full, feature ON, 8h downtime. korektaDni = round2(8/24)=0.33.
    // Weekday adjusted = max(0, round2(20-0.33)) = 19.67; Saturdays untouched (2).
    // totalDays = round2(19.67 + 2) = 21.67. km: round(19.67*540)=10622 + 540 = 11162.
    const r = run({
      dateStart: '2026-02-01',
      dateEnd: '2026-02-28',
      hoursAdjusted: 8,
      limits: LIMITS_2026_SAT,
    });
    expect(r.rawTotalDays).toBe(22); // pre-adjust: 20 weekday + 2 Saturday
    expect(r.totalDays).toBe(21.67); // 19.67 weekday + 2 Saturday
    expect(r.breakdown[0].workingDays).toBe(19.67);
    expect(r.breakdown[0].saturdaysCounted).toBe(2);
    // hoursAdjusted never touches Saturdays — the credited-date list is intact.
    expect(r.breakdown[0].saturdayDays).toEqual(['2026-02-07', '2026-02-21']);
    expect(r.breakdown[0].kmFromSaturdays).toBe(540);
    expect(r.kmGuaranteed).toBe(11162); // 10622 + 540
  });
});

// ─── Boundary-day credited fractions (firstDay / lastDay) ────────
//
// The engine surfaces, for the period's first and last calendar day, the
// RAW credited fraction (0..1, 2-dp) BEFORE the month-level `hoursAdjusted`
// distribution. `0` when that day was excluded (Sunday / EU-ban weekday /
// non-qualifying or feature-off Saturday); `1` for a counted whole day or a
// counted qualifying Saturday; the time fraction for a counted weekday. These
// drive the carrier "Miesiąc" preview block; capturing them in the engine (not
// re-deriving downstream) is the same drift fix applied to the Saturday hint.
describe('calcKmGwarantPerMonth — boundary-day credited fractions', () => {
  it('multi-day with timeFrom 06:00 / timeTo 12:00 → firstDay 0.75, lastDay 0.5', () => {
    // Mar 9 (Mon, first, starts 06:00 → (24-6)/24 = 0.75) … Mar 13 (Fri, last,
    // stops 12:00 → 12/24 = 0.5). Distinct dates on the two boundaries.
    const r = run({
      dateStart: '2026-03-09',
      dateEnd: '2026-03-13',
      timeFrom: '06:00',
      timeTo: '12:00',
    });
    expect(r.firstDay).toEqual({ date: '2026-03-09', fraction: 0.75 });
    expect(r.lastDay).toEqual({ date: '2026-03-13', fraction: 0.5 });
  });

  it('single-day with timeFrom/timeTo → firstDay === lastDay, fraction = window/24', () => {
    // Mar 10 (Tue), 08:00–16:00 → 8/24 = 0.3333 → round2 0.33. Both boundaries
    // are the SAME calendar day, so firstDay and lastDay carry identical values.
    const r = run({
      dateStart: '2026-03-10',
      dateEnd: '2026-03-10',
      timeFrom: '08:00',
      timeTo: '16:00',
    });
    expect(r.firstDay).toEqual({ date: '2026-03-10', fraction: 0.33 });
    expect(r.lastDay).toEqual(r.firstDay);
  });

  it('no times → both boundary weekdays credited whole (fraction 1)', () => {
    const r = run({ dateStart: '2026-03-09', dateEnd: '2026-03-13' });
    expect(r.firstDay).toEqual({ date: '2026-03-09', fraction: 1 });
    expect(r.lastDay).toEqual({ date: '2026-03-13', fraction: 1 });
  });

  it('single-day counted weekday, no times → firstDay === lastDay, fraction 1', () => {
    const r = run({ dateStart: '2026-03-10', dateEnd: '2026-03-10' });
    expect(r.firstDay).toEqual({ date: '2026-03-10', fraction: 1 });
    expect(r.lastDay).toEqual({ date: '2026-03-10', fraction: 1 });
  });

  it('first day on a Sunday → firstDay.fraction 0 (excluded, NOT null)', () => {
    // Mar 8 2026 is a Sunday. It is excluded (credited 0) but still surfaced as
    // the boundary day with fraction 0 — `null` is reserved for invalid ranges.
    const r = run({ dateStart: '2026-03-08', dateEnd: '2026-03-12' });
    expect(r.firstDay).toEqual({ date: '2026-03-08', fraction: 0 });
    // Last day (Thu Mar 12) is a counted whole weekday.
    expect(r.lastDay).toEqual({ date: '2026-03-12', fraction: 1 });
  });

  it('last day on a Sunday → lastDay.fraction 0', () => {
    // Mar 8 2026 (Sun) as the closing boundary.
    const r = run({ dateStart: '2026-03-04', dateEnd: '2026-03-08' });
    expect(r.firstDay).toEqual({ date: '2026-03-04', fraction: 1 });
    expect(r.lastDay).toEqual({ date: '2026-03-08', fraction: 0 });
  });

  it('first day on an EU-ban holiday (1 Jan Nowy Rok) → firstDay.fraction 0', () => {
    // Jan 1 2026 is a Thursday AND Nowy Rok — a banned weekday, credited 0.
    const r = run({ dateStart: '2026-01-01', dateEnd: '2026-01-09' });
    expect(r.firstDay).toEqual({ date: '2026-01-01', fraction: 0 });
    expect(r.lastDay).toEqual({ date: '2026-01-09', fraction: 1 });
  });

  it('last day on an EU-ban holiday (1 May Swieto Pracy) → lastDay.fraction 0', () => {
    // May 1 2026 is a Friday AND Swieto Pracy — banned weekday, credited 0.
    const r = run({ dateStart: '2026-04-27', dateEnd: '2026-05-01' });
    expect(r.firstDay).toEqual({ date: '2026-04-27', fraction: 1 });
    expect(r.lastDay).toEqual({ date: '2026-05-01', fraction: 0 });
  });

  it('counted qualifying Saturday boundary → fraction 1 (whole, NOT fractioned by time)', () => {
    // Feb 7 2026 (Sat, ordinal 1 → qualifies) opens the period; even with a
    // 12:00 start the Saturday is credited as a WHOLE day (1), never fractioned.
    const r = run({
      dateStart: '2026-02-07',
      dateEnd: '2026-02-09',
      timeFrom: '12:00',
      limits: LIMITS_2026_SAT,
    });
    expect(r.firstDay).toEqual({ date: '2026-02-07', fraction: 1 });
    // Feb 9 (Mon) closes the period as a counted whole weekday.
    expect(r.lastDay).toEqual({ date: '2026-02-09', fraction: 1 });
  });

  it('feature-off Saturday boundary → fraction 0 (legacy behavior)', () => {
    // Mar 7 2026 (Sat) opens the period with the odd-Saturday feature OFF
    // (LIMITS_2026 has no kmPerSaturday) → the Saturday is credited 0.
    const r = run({ dateStart: '2026-03-07', dateEnd: '2026-03-11' });
    expect(r.firstDay).toEqual({ date: '2026-03-07', fraction: 0 });
    expect(r.lastDay).toEqual({ date: '2026-03-11', fraction: 1 });
  });

  it('firstDay/lastDay report the RAW pre-hoursAdjusted fraction', () => {
    // Mar 2 (Mon) → Mar 13 (Fri), 8h downtime correction. `hoursAdjusted` is a
    // month-level day distribution and must NOT rewrite a per-day fraction, so
    // both boundary weekdays still report their raw credited 1.
    const r = run({
      dateStart: '2026-03-02',
      dateEnd: '2026-03-13',
      hoursAdjusted: 8,
    });
    // The month total was shaved (see the hoursAdjusted suite) …
    expect(r.totalDays).toBe(9.67);
    // … but the boundary days keep their RAW pre-adjustment fraction.
    expect(r.firstDay).toEqual({ date: '2026-03-02', fraction: 1 });
    expect(r.lastDay).toEqual({ date: '2026-03-13', fraction: 1 });
  });

  it('invalid / inverted range → both firstDay and lastDay are null', () => {
    const inverted = run({ dateStart: '2026-03-15', dateEnd: '2026-03-10' });
    expect(inverted.firstDay).toBeNull();
    expect(inverted.lastDay).toBeNull();

    const badIso = run({ dateStart: 'not-a-date', dateEnd: '2026-03-15' });
    expect(badIso.firstDay).toBeNull();
    expect(badIso.lastDay).toBeNull();
  });
});
