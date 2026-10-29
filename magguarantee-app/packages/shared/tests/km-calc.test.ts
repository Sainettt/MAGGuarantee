// Fixture suite for `calcKmGwarant` — the guarantee engine priced per ISO week
// (2026-10-29, docs/01-overview.md §«Расчёт гарантии»).
//
// There is no production data: every expected value below is derived by hand
// from the calendar (the facts each fixture relies on are written next to it).
// If a fixture diverges, fix the engine, not the test — unless the calendar
// fact in the comment is wrong.
//
// Calendar facts used throughout (2026: 1 January is a Thursday ⇒ 53 ISO weeks):
//   2026-W01 = 29.12.2025–04.01.2026     2026-W24 = 08.06–14.06
//   2026-W14 = 30.03–05.04               2026-W27 = 29.06–05.07 (June/July)
//   2026-W23 = 01.06–07.06               2026-W53 = 28.12.2026–03.01.2027
//   EU bans 2026 on weekdays: 01.01 Thu, 06.01 Tue, 03.04 Fri (Good Friday),
//   06.04 Mon (Easter Monday), 01.05 Fri, 14.05 Thu, 25.05 Mon, 02.06 Tue,
//   04.06 Thu (Boze Cialo), 14.07, 21.07, 26.10, 11.11, 08.12, 25.12 Fri.
//   EU bans 2026 on Saturdays: 15.08, 03.10, 26.12.
//
// Coverage (34 fixtures):
//   A  full / partial weeks, holidays             1–4
//   B  weeks across months, adjacent limits       5–6
//   C  ISO-year edges (W53, W01 in December,
//      1 Jan in the previous ISO year)            7–10
//   D  the week's Saturday (>0 / 0 / NULL / ban /
//      outside the period / boundary / per week)  11–18
//   E  Easter weeks 2024 / 2025 / 2026           19–21
//   F  fractions (timeFrom / timeTo)              22–24
//   G  hoursAdjusted                              25–28
//   H  fallback / switched-off weeks              29–31
//   I  3-month claim, docs/14 example             32–33
//   J  invalid input                              34
//   +  boundary-day fractions, Saturday status, TZ independence

import { describe, expect, it } from 'vitest';

import {
  FALLBACK_KM_PER_DAY,
  FALLBACK_KM_PER_SATURDAY,
  FALLBACK_RATE_PER_KM,
  FALLBACK_WEEK_LIMIT,
  calcKmGwarant,
  weekSaturdayStatus,
  type KmCalcInput,
  type KmCalcResult,
  type WeekBreakdown,
  type WeekLimit,
} from '../src/domain/km-calc';

/** Run the engine with the global fallback and no configured weeks unless given. */
function run(
  input: Partial<KmCalcInput> & Pick<KmCalcInput, 'dateStart' | 'dateEnd'>,
): KmCalcResult {
  return calcKmGwarant({ limits: {}, fallback: FALLBACK_WEEK_LIMIT, ...input });
}

/** A full breakdown row with the "nothing special" defaults, for `toEqual`. */
function row(
  fields: Pick<WeekBreakdown, 'isoWeek' | 'weekStart' | 'weekEnd' | 'periodStart' | 'periodEnd'> &
    Partial<WeekBreakdown>,
): WeekBreakdown {
  return {
    workingDays: 5,
    kmPerDay: 540,
    ratePerKm: 0.5,
    saturdaysCounted: 0,
    kmPerSaturday: 0,
    kmFromSaturdays: 0,
    saturdayDays: [],
    kmInWeek: 2_700,
    excludedDays: [],
    ...fields,
  };
}

const sum = (rows: readonly WeekBreakdown[], pick: (r: WeekBreakdown) => number): number =>
  rows.reduce((acc, r) => acc + pick(r), 0);

describe('fallback constants', () => {
  it('are 540 km/day, 0.5 EUR/km and 0 km for the Saturday', () => {
    expect(FALLBACK_KM_PER_DAY).toBe(540);
    expect(FALLBACK_RATE_PER_KM).toBe(0.5);
    expect(FALLBACK_KM_PER_SATURDAY).toBe(0);
    expect(FALLBACK_WEEK_LIMIT).toEqual({ kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 });
    expect(Object.isFrozen(FALLBACK_WEEK_LIMIT)).toBe(true);
  });
});

// ─── A. full / partial weeks ─────────────────────────────

describe('calcKmGwarant — full and partial weeks', () => {
  it('1. full W24 2026 (Mon–Sun), unconfigured ⇒ fallback, one row', () => {
    const r = run({ dateStart: '2026-06-08', dateEnd: '2026-06-14' });
    expect(r.totalDays).toBe(5);
    expect(r.rawTotalDays).toBe(5);
    expect(r.kmGuaranteed).toBe(2_700);
    expect(r.ratePerKmEffective).toBe(0.5);
    expect(r.breakdown).toEqual([
      row({
        isoWeek: '2026-W24',
        weekStart: '2026-06-08',
        weekEnd: '2026-06-14',
        periodStart: '2026-06-08',
        periodEnd: '2026-06-14',
      }),
    ]);
    // The Sunday boundary is excluded (0), the Monday is whole (1).
    expect(r.firstDay).toEqual({ date: '2026-06-08', fraction: 1 });
    expect(r.lastDay).toEqual({ date: '2026-06-14', fraction: 0 });
  });

  it('2. Mon–Fri of W24 ⇒ 5 days, period clipped to Friday', () => {
    const r = run({ dateStart: '2026-06-08', dateEnd: '2026-06-12' });
    expect(r.kmGuaranteed).toBe(2_700);
    expect(r.breakdown[0]).toMatchObject({ periodStart: '2026-06-08', periodEnd: '2026-06-12' });
    expect(r.lastDay).toEqual({ date: '2026-06-12', fraction: 1 });
  });

  it('3. W23 2026 ⇒ 02.06 (IT) and 04.06 (Boze Cialo) excluded, 3 days', () => {
    const r = run({ dateStart: '2026-06-01', dateEnd: '2026-06-07' });
    expect(r.totalDays).toBe(3);
    expect(r.kmGuaranteed).toBe(1_620);
    expect(r.breakdown[0]!.excludedDays).toEqual([
      { date: '2026-06-02', label: 'Dzien Republiki (IT)' },
      { date: '2026-06-04', label: 'Boze Cialo (DE/AT/IT)' },
    ]);
  });

  it('4. Thu–Tue across W24/W25 ⇒ two rows clipped to the period', () => {
    // 11.06 Thu, 12.06 Fri | 15.06 Mon, 16.06 Tue.
    const r = run({ dateStart: '2026-06-11', dateEnd: '2026-06-16' });
    expect(r.breakdown.map((w) => [w.isoWeek, w.periodStart, w.periodEnd, w.workingDays])).toEqual([
      ['2026-W24', '2026-06-11', '2026-06-14', 2],
      ['2026-W25', '2026-06-15', '2026-06-16', 2],
    ]);
    expect(r.breakdown.map((w) => [w.weekStart, w.weekEnd])).toEqual([
      ['2026-06-08', '2026-06-14'],
      ['2026-06-15', '2026-06-21'],
    ]);
    expect(r.kmGuaranteed).toBe(2_160);
  });
});

// ─── B. weeks across months ──────────────────────────────

describe('calcKmGwarant — weeks across calendar months', () => {
  it('5. adjacent weeks with different limits: W26 500 @0.5, W27 (June/July) 600 @0.6', () => {
    const r = run({
      dateStart: '2026-06-22',
      dateEnd: '2026-07-05',
      limits: {
        '2026-W26': { kmPerDay: 500, ratePerKm: 0.5 },
        '2026-W27': { kmPerDay: 600, ratePerKm: 0.6 },
        // A July-ish key must not leak into W27's June days (no month split).
        '2026-W28': { kmPerDay: 1, ratePerKm: 9 },
      },
    });
    expect(r.breakdown).toEqual([
      row({
        isoWeek: '2026-W26',
        weekStart: '2026-06-22',
        weekEnd: '2026-06-28',
        periodStart: '2026-06-22',
        periodEnd: '2026-06-28',
        kmPerDay: 500,
        kmInWeek: 2_500,
      }),
      row({
        isoWeek: '2026-W27',
        weekStart: '2026-06-29',
        weekEnd: '2026-07-05',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        kmPerDay: 600,
        ratePerKm: 0.6,
        kmInWeek: 3_000,
      }),
    ]);
    expect(r.kmGuaranteed).toBe(5_500);
    // (2500 × 0.5 + 3000 × 0.6) / 5500 = 0.55454… → 0.555
    expect(r.ratePerKmEffective).toBe(0.555);
  });

  it('6. a period inside one week that crosses 30.06 → 01.07 is a single row', () => {
    const r = run({
      dateStart: '2026-06-30',
      dateEnd: '2026-07-03',
      limits: { '2026-W27': { kmPerDay: 600, ratePerKm: 0.6 } },
    });
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0]).toMatchObject({
      isoWeek: '2026-W27',
      weekStart: '2026-06-29',
      weekEnd: '2026-07-05',
      periodStart: '2026-06-30',
      periodEnd: '2026-07-03',
      workingDays: 4,
      kmInWeek: 2_400,
    });
    expect(r.ratePerKmEffective).toBe(0.6);
  });
});

// ─── C. ISO-year edges ───────────────────────────────────

describe('calcKmGwarant — ISO-year edges', () => {
  it('7. 2026-W53 (28.12.2026–03.01.2027): one row, 1 Jan 2027 excluded', () => {
    const r = run({
      dateStart: '2026-12-28',
      dateEnd: '2027-01-03',
      limits: {
        '2026-W53': { kmPerDay: 500, ratePerKm: 0.5 },
        '2027-W01': { kmPerDay: 1, ratePerKm: 9 },
      },
    });
    expect(r.breakdown).toEqual([
      row({
        isoWeek: '2026-W53',
        weekStart: '2026-12-28',
        weekEnd: '2027-01-03',
        periodStart: '2026-12-28',
        periodEnd: '2027-01-03',
        workingDays: 4,
        kmPerDay: 500,
        kmInWeek: 2_000,
        excludedDays: [{ date: '2027-01-01', label: 'Nowy Rok' }],
      }),
    ]);
    expect(r.kmGuaranteed).toBe(2_000);
  });

  it('8. 2026-W01 starts in December 2025: the December days use the 2026-W01 limits', () => {
    const r = run({
      dateStart: '2025-12-29',
      dateEnd: '2026-01-04',
      limits: {
        '2026-W01': { kmPerDay: 400, ratePerKm: 0.45 },
        '2025-W52': { kmPerDay: 1, ratePerKm: 9 },
        '2025-W53': { kmPerDay: 1, ratePerKm: 9 }, // does not exist — never looked up
      },
    });
    // 29, 30, 31 Dec + 2 Jan; 1 Jan (Nowy Rok) excluded.
    expect(r.breakdown).toEqual([
      row({
        isoWeek: '2026-W01',
        weekStart: '2025-12-29',
        weekEnd: '2026-01-04',
        periodStart: '2025-12-29',
        periodEnd: '2026-01-04',
        workingDays: 4,
        kmPerDay: 400,
        ratePerKm: 0.45,
        kmInWeek: 1_600,
        excludedDays: [{ date: '2026-01-01', label: 'Nowy Rok' }],
      }),
    ]);
    expect(r.ratePerKmEffective).toBe(0.45);
  });

  it('9. 1 Jan 2021 belongs to 2020-W53 (Thursday 31.12.2020)', () => {
    const r = run({
      dateStart: '2020-12-28',
      dateEnd: '2021-01-10',
      limits: {
        '2020-W53': { kmPerDay: 300, ratePerKm: 0.4 },
        '2021-W01': { kmPerDay: 540, ratePerKm: 0.5 },
        '2021-W53': { kmPerDay: 1, ratePerKm: 9 }, // 2021 has 52 weeks
      },
    });
    expect(r.breakdown.map((w) => [w.isoWeek, w.weekStart, w.weekEnd, w.workingDays, w.kmInWeek])).toEqual([
      // 28–31.12 (4 days); 01.01.2021 Fri Nowy Rok excluded.
      ['2020-W53', '2020-12-28', '2021-01-03', 4, 1_200],
      // 04, 05, 07, 08.01; 06.01 Wed Trzech Kroli excluded.
      ['2021-W01', '2021-01-04', '2021-01-10', 4, 2_160],
    ]);
    expect(r.breakdown[0]!.excludedDays).toEqual([{ date: '2021-01-01', label: 'Nowy Rok' }]);
    expect(r.kmGuaranteed).toBe(3_360);
    // (1200 × 0.4 + 2160 × 0.5) / 3360 = 0.46428… → 0.464
    expect(r.ratePerKmEffective).toBe(0.464);
  });

  it('10. Christmas → New Year over W52, W53 and 2027-W01, only W52 configured', () => {
    const r = run({
      dateStart: '2026-12-21',
      dateEnd: '2027-01-10',
      limits: { '2026-W52': { kmPerDay: 600, ratePerKm: 0.5 } },
    });
    expect(r.breakdown.map((w) => [w.isoWeek, w.workingDays, w.kmPerDay, w.kmInWeek])).toEqual([
      ['2026-W52', 4, 600, 2_400], // 25.12 Fri excluded; Sat 26.12 has no Saturday guarantee
      ['2026-W53', 4, 540, 2_160], // fallback; 01.01.2027 excluded
      ['2027-W01', 4, 540, 2_160], // fallback; 06.01.2027 Wed excluded
    ]);
    // A ban on a Saturday WITHOUT Saturday guarantee is not listed (weekend).
    expect(r.breakdown[0]!.excludedDays).toEqual([{ date: '2026-12-25', label: 'Boze Narodzenie' }]);
    expect(r.kmGuaranteed).toBe(6_720);
  });
});

// ─── D. the week's Saturday ──────────────────────────────

describe('calcKmGwarant — the Saturday of a week', () => {
  const W24 = { dateStart: '2026-06-08', dateEnd: '2026-06-14' } as const;

  it('11. kmPerSaturday > 0 and the Saturday inside the period ⇒ credited, one whole day', () => {
    const r = run({ ...W24, limits: { '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 } } });
    expect(r.breakdown[0]).toEqual(
      row({
        isoWeek: '2026-W24',
        weekStart: '2026-06-08',
        weekEnd: '2026-06-14',
        periodStart: '2026-06-08',
        periodEnd: '2026-06-14',
        saturdaysCounted: 1,
        kmPerSaturday: 270,
        kmFromSaturdays: 270,
        saturdayDays: ['2026-06-13'],
        kmInWeek: 2_970,
      }),
    );
    expect(r.totalDays).toBe(6);
    expect(r.kmGuaranteed).toBe(2_970);
    expect(weekSaturdayStatus(r.breakdown[0]!)).toBe('counted');
  });

  it('12. kmPerSaturday = 0 ⇒ the Saturday is excluded like a Sunday', () => {
    const r = run({ ...W24, limits: { '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 } } });
    expect(r.breakdown[0]).toMatchObject({
      saturdaysCounted: 0,
      kmPerSaturday: 0,
      kmFromSaturdays: 0,
      saturdayDays: [],
      kmInWeek: 2_700,
      excludedDays: [],
    });
    expect(r.totalDays).toBe(5);
    expect(weekSaturdayStatus(r.breakdown[0]!)).toBe('none');
  });

  it('13. kmPerSaturday NULL (key absent) ⇒ falls to the Saturday fallback 0', () => {
    const r = run({ ...W24, limits: { '2026-W24': { kmPerDay: 540, ratePerKm: 0.5 } } });
    expect(r.breakdown[0]!.kmPerSaturday).toBe(0);
    expect(r.breakdown[0]!.saturdaysCounted).toBe(0);
    expect(r.kmGuaranteed).toBe(2_700);
  });

  it('14. guaranteed Saturday on an EU ban (15.08.2026) ⇒ excludedDays, not paid, not a day', () => {
    const r = run({
      dateStart: '2026-08-10',
      dateEnd: '2026-08-16',
      limits: { '2026-W33': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 300 } },
    });
    expect(r.breakdown[0]).toMatchObject({
      isoWeek: '2026-W33',
      workingDays: 5,
      saturdaysCounted: 0,
      kmPerSaturday: 300,
      kmFromSaturdays: 0,
      saturdayDays: [],
      kmInWeek: 2_700,
      excludedDays: [{ date: '2026-08-15', label: 'Wniebowziecie NMP' }],
    });
    expect(r.totalDays).toBe(5);
    expect(weekSaturdayStatus(r.breakdown[0]!)).toBe('notCounted');

    // Same week without Saturday guarantee: the holiday Saturday is a plain weekend.
    const off = run({ dateStart: '2026-08-10', dateEnd: '2026-08-16' });
    expect(off.breakdown[0]!.excludedDays).toEqual([]);
  });

  it('15. the week ends on Thursday ⇒ its Saturday is outside the period, not credited', () => {
    const r = run({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-11',
      limits: { '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 } },
    });
    expect(r.breakdown[0]).toMatchObject({
      periodEnd: '2026-06-11',
      workingDays: 4,
      saturdaysCounted: 0,
      kmPerSaturday: 270,
      saturdayDays: [],
      kmInWeek: 2_160,
      excludedDays: [],
    });
    expect(weekSaturdayStatus(r.breakdown[0]!)).toBe('notCounted');
  });

  it('16. period starting on a guaranteed Saturday at 18:00 ⇒ that Saturday is whole', () => {
    const r = run({
      dateStart: '2026-06-13',
      dateEnd: '2026-06-19',
      timeFrom: '18:00',
      limits: { '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 } },
    });
    expect(r.breakdown.map((w) => [w.isoWeek, w.periodStart, w.periodEnd, w.workingDays, w.saturdaysCounted, w.kmInWeek])).toEqual([
      ['2026-W24', '2026-06-13', '2026-06-14', 0, 1, 270],
      ['2026-W25', '2026-06-15', '2026-06-19', 5, 0, 2_700],
    ]);
    expect(r.firstDay).toEqual({ date: '2026-06-13', fraction: 1 });
    expect(r.totalDays).toBe(6);
  });

  it('17. single-day guaranteed Saturday with timeFrom/timeTo ⇒ whole day, no proportion', () => {
    const r = run({
      dateStart: '2026-06-13',
      dateEnd: '2026-06-13',
      timeFrom: '10:00',
      timeTo: '14:00',
      limits: { '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 } },
    });
    expect(r.totalDays).toBe(1);
    expect(r.kmGuaranteed).toBe(270);
    expect(r.firstDay).toEqual({ date: '2026-06-13', fraction: 1 });
    expect(r.lastDay).toEqual({ date: '2026-06-13', fraction: 1 });
  });

  it('18. Saturdays are opted in per week — no "odd Saturday of the month" rule', () => {
    // June 2026 Saturdays: 06 (W23), 13 (W24), 20 (W25), 27 (W26). The old rule
    // would have paid the 1st and 3rd (06, 20); now W24 and W26 decide.
    const r = run({
      dateStart: '2026-06-01',
      dateEnd: '2026-06-28',
      limits: {
        '2026-W23': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
        '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
        '2026-W25': { kmPerDay: 540, ratePerKm: 0.5 },
        '2026-W26': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 300 },
      },
    });
    expect(r.breakdown.flatMap((w) => w.saturdayDays)).toEqual(['2026-06-13', '2026-06-27']);
    // 3 + 5 + 5 + 5 weekdays = 18 × 540 = 9720, + 270 + 300.
    expect(r.kmGuaranteed).toBe(10_290);
    expect(r.totalDays).toBe(20);
    expect(r.rawTotalDays).toBe(20);
  });
});

// ─── E. Easter weeks ─────────────────────────────────────

describe('calcKmGwarant — Easter weeks', () => {
  it('19. Easter 2026 (05.04): Good Friday in W14, Easter Monday in W15', () => {
    const r = run({ dateStart: '2026-03-30', dateEnd: '2026-04-12' });
    expect(r.breakdown.map((w) => [w.isoWeek, w.workingDays, w.excludedDays])).toEqual([
      ['2026-W14', 4, [{ date: '2026-04-03', label: 'Wielki Piatek (DE/NL)' }]],
      ['2026-W15', 4, [{ date: '2026-04-06', label: 'Poniedzialek Wielkanocny' }]],
    ]);
    expect(r.kmGuaranteed).toBe(4_320);
  });

  it('20. Easter 2025 (20.04): 2025-W16 Good Friday 18.04, 2025-W17 Easter Monday 21.04', () => {
    const r = run({ dateStart: '2025-04-14', dateEnd: '2025-04-25' });
    expect(r.breakdown.map((w) => [w.isoWeek, w.weekStart, w.workingDays])).toEqual([
      ['2025-W16', '2025-04-14', 4],
      ['2025-W17', '2025-04-21', 4],
    ]);
    expect(r.breakdown.flatMap((w) => w.excludedDays.map((d) => d.date))).toEqual([
      '2025-04-18',
      '2025-04-21',
    ]);
    expect(r.kmGuaranteed).toBe(4_320);
  });

  it('21. Easter 2024 (31.03): 2024-W13 / W14 with different limits', () => {
    const r = run({
      dateStart: '2024-03-25',
      dateEnd: '2024-04-05',
      limits: {
        '2024-W13': { kmPerDay: 500, ratePerKm: 0.5 },
        '2024-W14': { kmPerDay: 600, ratePerKm: 0.6 },
      },
    });
    // W13: 25–28.03 (29.03 Good Friday); W14: 02–05.04 (01.04 Easter Monday).
    expect(r.breakdown.map((w) => [w.isoWeek, w.workingDays, w.kmInWeek])).toEqual([
      ['2024-W13', 4, 2_000],
      ['2024-W14', 4, 2_400],
    ]);
    expect(r.breakdown.flatMap((w) => w.excludedDays.map((d) => d.label))).toEqual([
      'Wielki Piatek (DE/NL)',
      'Poniedzialek Wielkanocny',
    ]);
    // (2000 × 0.5 + 2400 × 0.6) / 4400 = 0.55454… → 0.555
    expect(r.ratePerKmEffective).toBe(0.555);
  });
});

// ─── F. fractions ────────────────────────────────────────

describe('calcKmGwarant — fractional boundary days', () => {
  it('22. mid-week start 12:00 and mid-week end 06:00 across two weeks', () => {
    // W24: Wed 10.06 ½ + Thu + Fri = 2.5; W25: Mon 15.06 + Tue 16.06 ¼ = 1.25.
    const r = run({ dateStart: '2026-06-10', dateEnd: '2026-06-16', timeFrom: '12:00', timeTo: '06:00' });
    expect(r.breakdown.map((w) => [w.isoWeek, w.periodStart, w.periodEnd, w.workingDays, w.kmInWeek])).toEqual([
      ['2026-W24', '2026-06-10', '2026-06-14', 2.5, 1_350],
      ['2026-W25', '2026-06-15', '2026-06-16', 1.25, 675],
    ]);
    expect(r.totalDays).toBe(3.75);
    expect(r.kmGuaranteed).toBe(2_025);
    expect(r.firstDay).toEqual({ date: '2026-06-10', fraction: 0.5 });
    expect(r.lastDay).toEqual({ date: '2026-06-16', fraction: 0.25 });
  });

  it('23. single weekday 08:00–20:00 ⇒ (20 − 8) / 24 = 0.5 day', () => {
    const r = run({ dateStart: '2026-06-10', dateEnd: '2026-06-10', timeFrom: '08:00', timeTo: '20:00' });
    expect(r.totalDays).toBe(0.5);
    expect(r.kmGuaranteed).toBe(270);
    expect(r.firstDay).toEqual({ date: '2026-06-10', fraction: 0.5 });
    expect(r.lastDay).toEqual(r.firstDay);
  });

  it('24. a period starting on Sunday 18:00 still gets a (zero-day) row for that week', () => {
    const r = run({ dateStart: '2026-06-14', dateEnd: '2026-06-19', timeFrom: '18:00' });
    expect(r.breakdown.map((w) => [w.isoWeek, w.periodStart, w.periodEnd, w.workingDays, w.kmInWeek])).toEqual([
      ['2026-W24', '2026-06-14', '2026-06-14', 0, 0],
      ['2026-W25', '2026-06-15', '2026-06-19', 5, 2_700],
    ]);
    expect(r.firstDay).toEqual({ date: '2026-06-14', fraction: 0 });
  });
});

// ─── G. hoursAdjusted ────────────────────────────────────

describe('calcKmGwarant — hoursAdjusted', () => {
  it('25. spread only over weeks with kmPerDay > 0 (W24 off, W25 on, 12 h)', () => {
    const r = run({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-21',
      hoursAdjusted: 12,
      limits: {
        '2026-W24': { kmPerDay: 0, ratePerKm: 0.5 },
        '2026-W25': { kmPerDay: 540, ratePerKm: 0.5 },
      },
    });
    // korekta = 0.5 day, all of it on W25: 5 → 4.5; W24 keeps its 5 days.
    expect(r.breakdown.map((w) => [w.isoWeek, w.workingDays, w.kmInWeek])).toEqual([
      ['2026-W24', 5, 0],
      ['2026-W25', 4.5, 2_430],
    ]);
    expect(r.rawTotalDays).toBe(10);
    expect(r.totalDays).toBe(9.5);
    expect(r.kmGuaranteed).toBe(2_430);
  });

  it('26. proportional across two active weeks of unequal length (3 + 5 days, 16 h)', () => {
    const r = run({ dateStart: '2026-06-10', dateEnd: '2026-06-19', hoursAdjusted: 16 });
    // korekta = round2(16/24) = 0.67; W24 3 − 3/8·0.67 = 2.74875 → 2.75;
    // W25 5 − 5/8·0.67 = 4.58125 → 4.58.
    expect(r.breakdown.map((w) => [w.workingDays, w.kmInWeek])).toEqual([
      [2.75, 1_485],
      [4.58, 2_473],
    ]);
    expect(r.rawTotalDays).toBe(8);
    expect(r.totalDays).toBe(7.33);
    expect(r.kmGuaranteed).toBe(3_958);
  });

  it('27. a credited Saturday is untouched by the correction (24 h on W24 with Saturday)', () => {
    const r = run({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-14',
      hoursAdjusted: 24,
      limits: { '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 } },
    });
    expect(r.breakdown[0]).toMatchObject({ workingDays: 4, saturdaysCounted: 1, kmInWeek: 2_430 });
    expect(r.rawTotalDays).toBe(6);
    expect(r.totalDays).toBe(5);
  });

  it('28. hoursAdjusted 0 / negative ⇒ no correction', () => {
    const base = run({ dateStart: '2026-06-08', dateEnd: '2026-06-19' });
    expect(run({ dateStart: '2026-06-08', dateEnd: '2026-06-19', hoursAdjusted: 0 })).toEqual(base);
    expect(run({ dateStart: '2026-06-08', dateEnd: '2026-06-19', hoursAdjusted: -8 })).toEqual(base);
    expect(base.totalDays).toBe(base.rawTotalDays);
  });
});

// ─── H. fallback / switched-off weeks ────────────────────

describe('calcKmGwarant — fallback and switched-off weeks', () => {
  it('29. per-field fallback: kmPerDay 300 configured, ratePerKm NULL (NaN) ⇒ 0.5', () => {
    const r = run({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-14',
      limits: { '2026-W24': { kmPerDay: 300, ratePerKm: Number.NaN } },
    });
    expect(r.breakdown[0]).toMatchObject({ kmPerDay: 300, ratePerKm: 0.5, kmInWeek: 1_500 });
  });

  it('30. kmPerDay 0 is a deliberate switch-off, NOT the fallback; days still counted', () => {
    const r = run({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-14',
      limits: { '2026-W24': { kmPerDay: 0, ratePerKm: 0.7 } },
    });
    expect(r.breakdown[0]).toMatchObject({ workingDays: 5, kmPerDay: 0, ratePerKm: 0.7, kmInWeek: 0 });
    expect(r.totalDays).toBe(5);
    expect(r.kmGuaranteed).toBe(0);
    // No km to weigh ⇒ the effective rate is the fallback rate.
    expect(r.ratePerKmEffective).toBe(0.5);
  });

  it('31. a custom fallback (AppConfig override) applies to every unconfigured week', () => {
    const r = calcKmGwarant({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-21',
      limits: { '2026-W25': { kmPerDay: 540, ratePerKm: 0.5 } },
      fallback: { kmPerDay: 450, ratePerKm: 0.48 },
    });
    expect(r.breakdown.map((w) => [w.isoWeek, w.kmPerDay, w.ratePerKm, w.kmInWeek])).toEqual([
      ['2026-W24', 450, 0.48, 2_250],
      ['2026-W25', 540, 0.5, 2_700],
    ]);
    // (2250 × 0.48 + 2700 × 0.5) / 4950 = 0.49090… → 0.491
    expect(r.ratePerKmEffective).toBe(0.491);
  });
});

// ─── I. long claims ──────────────────────────────────────

describe('calcKmGwarant — long claims', () => {
  it('32. 3-month claim 02.03–31.05.2026 ⇒ 13 rows, Σ kmInWeek = kmGuaranteed', () => {
    const LIMITS: Record<string, WeekLimit> = {
      '2026-W10': { kmPerDay: 540, ratePerKm: 0.5 },
      '2026-W11': { kmPerDay: 540, ratePerKm: 0.5 },
      '2026-W12': { kmPerDay: 540, ratePerKm: 0.5 },
      '2026-W13': { kmPerDay: 540, ratePerKm: 0.5 },
      '2026-W14': { kmPerDay: 500, ratePerKm: 0.55 },
      '2026-W15': { kmPerDay: 500, ratePerKm: 0.55 },
      '2026-W16': { kmPerDay: 500, ratePerKm: 0.55, kmPerSaturday: 250 },
      '2026-W17': { kmPerDay: 500, ratePerKm: 0.55 },
      // W18..W22 unconfigured ⇒ fallback 540 @ 0.5
    };
    const r = run({ dateStart: '2026-03-02', dateEnd: '2026-05-31', limits: LIMITS });

    expect(r.breakdown.map((w) => w.isoWeek)).toEqual(
      Array.from({ length: 13 }, (_, i) => `2026-W${String(10 + i).padStart(2, '0')}`),
    );
    expect(r.breakdown.map((w) => w.workingDays)).toEqual([
      5, 5, 5, 5, // W10–W13
      4, // W14: 03.04 Good Friday
      4, // W15: 06.04 Easter Monday
      5, 5, // W16 (+ Saturday 18.04), W17
      4, // W18: 01.05 Swieto Pracy
      5, // W19
      4, // W20: 14.05 Wniebowstapienie
      5, // W21
      4, // W22: 25.05 Zielone Swiatki
    ]);
    expect(r.breakdown[6]!.saturdayDays).toEqual(['2026-04-18']);
    // 20 × 540 + (4 + 4 + 5 + 5) × 500 + 250 + 22 × 540 = 10800 + 9250 + 11880
    expect(r.kmGuaranteed).toBe(31_930);
    expect(sum(r.breakdown, (w) => w.kmInWeek)).toBe(r.kmGuaranteed);
    expect(r.totalDays).toBe(61);
    expect(sum(r.breakdown, (w) => w.workingDays + w.saturdaysCounted)).toBe(r.totalDays);
    // (10800 × 0.5 + 9250 × 0.55 + 11880 × 0.5) / 31930 = 0.51448… → 0.514
    expect(r.ratePerKmEffective).toBe(0.514);
    // Rows tile the period: contiguous, week-clipped.
    expect(r.breakdown[0]!.periodStart).toBe('2026-03-02');
    expect(r.breakdown[12]!.periodEnd).toBe('2026-05-31');
  });

  it('33. docs/14 §18.7.1 example 03.06–02.07.2026 ⇒ 1380 / 2700 / 0 / 300 / 2160 = 6540', () => {
    const r = run({
      dateStart: '2026-06-03',
      dateEnd: '2026-07-02',
      limits: {
        '2026-W23': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 300 },
        '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
        '2026-W25': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
        '2026-W26': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 300 },
        '2026-W27': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 300 },
      },
    });
    expect(
      r.breakdown.map((w) => [w.isoWeek, w.periodStart, w.periodEnd, w.workingDays, w.kmInWeek, weekSaturdayStatus(w)]),
    ).toEqual([
      ['2026-W23', '2026-06-03', '2026-06-07', 2, 1_380, 'counted'], // 04.06 Boze Cialo
      ['2026-W24', '2026-06-08', '2026-06-14', 5, 2_700, 'none'],
      ['2026-W25', '2026-06-15', '2026-06-21', 5, 0, 'none'],
      ['2026-W26', '2026-06-22', '2026-06-28', 5, 300, 'counted'],
      ['2026-W27', '2026-06-29', '2026-07-02', 4, 2_160, 'notCounted'], // Sat 04.07 outside
    ]);
    expect(r.breakdown[0]!.excludedDays).toEqual([{ date: '2026-06-04', label: 'Boze Cialo (DE/AT/IT)' }]);
    expect(r.kmGuaranteed).toBe(6_540);
    expect(r.totalDays).toBe(23);
  });
});

// ─── J. invalid input ────────────────────────────────────

describe('calcKmGwarant — invalid input', () => {
  it('34. inverted range / impossible date / garbage ⇒ empty result with the fallback rate', () => {
    const empty = {
      totalDays: 0,
      rawTotalDays: 0,
      kmGuaranteed: 0,
      ratePerKmEffective: 0.5,
      breakdown: [],
      firstDay: null,
      lastDay: null,
    };
    expect(run({ dateStart: '2026-06-14', dateEnd: '2026-06-08' })).toEqual(empty);
    expect(run({ dateStart: '2026-02-29', dateEnd: '2026-03-06' })).toEqual(empty);
    expect(run({ dateStart: 'not-a-date', dateEnd: '2026-03-06' })).toEqual(empty);
    expect(run({ dateStart: '2026-6-8', dateEnd: '2026-06-14' })).toEqual(empty);
    // The rate is rounded to 3 dp like any effective rate.
    expect(
      calcKmGwarant({ dateStart: 'x', dateEnd: 'y', limits: {}, fallback: { kmPerDay: 540, ratePerKm: 0.51234 } })
        .ratePerKmEffective,
    ).toBe(0.512);
  });
});

// ─── boundary days, Saturday status, invariants ──────────

describe('calcKmGwarant — boundary-day fractions', () => {
  it('last day on an EU ban (01.05.2026 Fri) with timeTo ⇒ fraction 0', () => {
    const r = run({ dateStart: '2026-04-27', dateEnd: '2026-05-01', timeTo: '12:00' });
    expect(r.lastDay).toEqual({ date: '2026-05-01', fraction: 0 });
    expect(r.breakdown[0]).toMatchObject({ isoWeek: '2026-W18', workingDays: 4 });
  });

  it('Saturday without guarantee as a boundary ⇒ fraction 0', () => {
    const r = run({ dateStart: '2026-06-10', dateEnd: '2026-06-13' });
    expect(r.lastDay).toEqual({ date: '2026-06-13', fraction: 0 });
  });

  it('firstDay / lastDay are RAW — before hoursAdjusted', () => {
    const r = run({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-12',
      timeFrom: '06:00',
      timeTo: '12:00',
      hoursAdjusted: 24,
    });
    expect(r.firstDay).toEqual({ date: '2026-06-08', fraction: 0.75 });
    expect(r.lastDay).toEqual({ date: '2026-06-12', fraction: 0.5 });
    expect(r.rawTotalDays).toBe(4.25);
    expect(r.totalDays).toBe(3.25);
  });
});

describe('weekSaturdayStatus', () => {
  it('counted / notCounted / none from the row', () => {
    expect(weekSaturdayStatus({ saturdaysCounted: 1, kmPerSaturday: 270 })).toBe('counted');
    expect(weekSaturdayStatus({ saturdaysCounted: 0, kmPerSaturday: 270 })).toBe('notCounted');
    expect(weekSaturdayStatus({ saturdaysCounted: 0, kmPerSaturday: 0 })).toBe('none');
  });
});

describe('calcKmGwarant — invariants', () => {
  it('Σ kmInWeek = kmGuaranteed, Σ days = totalDays and rows tile the period (a whole year)', () => {
    const r = run({
      dateStart: '2026-01-01',
      dateEnd: '2026-12-31',
      timeFrom: '15:00',
      timeTo: '09:00',
      hoursAdjusted: 30,
      limits: {
        '2026-W10': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 300 },
        '2026-W20': { kmPerDay: 480, ratePerKm: 0.6, kmPerSaturday: 250 },
        '2026-W33': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 300 },
      },
    });
    expect(r.breakdown).toHaveLength(53);
    expect(sum(r.breakdown, (w) => w.kmInWeek)).toBe(r.kmGuaranteed);
    for (const w of r.breakdown) {
      expect(w.saturdayDays).toHaveLength(w.saturdaysCounted);
      expect(w.kmInWeek).toBe(Math.round(w.workingDays * w.kmPerDay) + w.kmFromSaturdays);
      expect(w.periodStart >= w.weekStart && w.periodEnd <= w.weekEnd).toBe(true);
    }
    for (let i = 1; i < r.breakdown.length; i += 1) {
      const prevEnd = new Date(`${r.breakdown[i - 1]!.periodEnd}T00:00:00Z`).getTime();
      const nextStart = new Date(`${r.breakdown[i]!.periodStart}T00:00:00Z`).getTime();
      expect(nextStart - prevEnd).toBe(86_400_000);
    }
  });
});

describe('calcKmGwarant — time-zone independence', () => {
  it('produces identical results under every process TZ', () => {
    const input: KmCalcInput = {
      dateStart: '2026-03-27',
      dateEnd: '2027-01-05',
      timeFrom: '07:30',
      timeTo: '16:45',
      hoursAdjusted: 10,
      limits: {
        '2026-W14': { kmPerDay: 500, ratePerKm: 0.55, kmPerSaturday: 250 },
        '2026-W44': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 300 },
        '2026-W53': { kmPerDay: 600, ratePerKm: 0.6, kmPerSaturday: 300 },
      },
      fallback: FALLBACK_WEEK_LIMIT,
    };
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const baseline = calcKmGwarant(input);
      // DST-switching zones on both sides of UTC, incl. the 2026-03-29 /
      // 2026-10-25 EU switches inside the period, and a +14 h zone.
      for (const tz of ['Europe/Warsaw', 'America/New_York', 'America/Sao_Paulo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
        process.env.TZ = tz;
        expect(calcKmGwarant(input)).toEqual(baseline);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
