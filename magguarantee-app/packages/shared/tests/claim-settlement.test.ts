// Fixture suite for `settleClaim` + `limitsSnapshotFromBreakdown`
// (`src/domain/claim-settlement.ts`) — the payout layer of the «wyłączane
// limity gwarancji» feature, settled on the weryfikator's daily-km board for
// mixed periods since 2026-09-24 (docs/20 §0⁵).
//
// Two invariants every fixture is written around:
//   1. while every month of the period has its weekday guarantee on, the
//      settlement reproduces the pre-feature formula (`kmGuaranteed − mileage`)
//      bit-for-bit and never even looks at the board;
//   2. once a month has `kmPerDay = 0`, the kilometres charged are the board's
//      `drove` km on the counted days of the guaranteed months — the carrier's
//      `mileage` no longer affects the payout, and a counted day without a
//      board row is reported, never guessed.
//
// Coverage:
//   A  all active                      identity, board never read, legacy rows
//   B  spec example (docs/20 §0⁵)      21.08–18.09.2025, both board splits
//   C  off + on, both directions        active→off, off→active, all off
//   D  gaps                             off month (no block), active month (dates)
//   E  tylko soboty                     credited Saturday with / without a row
//   F  what counts in an active month   Sunday / holiday / non-credited Saturday,
//                                       first / last day in full
//   G  row kinds                        idle = filled, drove km null, empty board
//   H  calendar walk                    year boundary, leap day
//   I  day counters                     daysActive / daysTotal / hasDisabledMonths
//   J  `limitsSnapshotFromBreakdown` + the FALLBACK_KM_PER_SATURDAY engine pin

import { describe, expect, it } from 'vitest';

import {
  calcKmGwarantPerMonth,
  type KmCalcResult,
  type MonthLimit,
} from '../src/domain/km-calc';
import {
  isMonthActive,
  limitsSnapshotFromBreakdown,
  settleClaim,
  settlementMonthMode,
  settlementNeedsBoard,
  type BoardDay,
  type ClaimSettlementInput,
  type SettlementMonth,
} from '../src/domain/claim-settlement';

// ─── helpers ─────────────────────────────────────────────

const FALLBACK: MonthLimit = { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 };

/** Month limit with the weekday guarantee ON. */
const ON: MonthLimit = { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 };
/** Month limit explicitly switched OFF (0 / 0). */
const OFF: MonthLimit = { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 };
/** "Tylko soboty": weekdays off, credited Saturdays at 270 km. */
const SAT_ONLY: MonthLimit = { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 270 };

/** Hand-made active month row (no calendar needed for the declared path). */
function active(
  workingDays: number,
  overrides: Partial<SettlementMonth> = {},
): SettlementMonth {
  return { kmPerDay: 540, workingDays, saturdaysCounted: 0, ...overrides };
}

/** Hand-made month row with the guarantee switched OFF (0 / 0). */
function disabled(
  workingDays: number,
  overrides: Partial<SettlementMonth> = {},
): SettlementMonth {
  return {
    kmPerDay: 0,
    kmPerSaturday: 0,
    workingDays,
    saturdaysCounted: 0,
    ...overrides,
  };
}

/** The pre-feature formula, kept as the oracle for the identity tests. */
function legacySettlement(
  kmGuaranteed: number,
  mileage: number,
  rate: number,
): { kmDifference: number; paymentEur: number } {
  const kmDifference = kmGuaranteed - mileage;
  return {
    kmDifference,
    paymentEur:
      kmDifference > 0 ? Math.round(kmDifference * rate * 100) / 100 : 0,
  };
}

/** Every calendar day of `[from, to]` (UTC arithmetic — no local-time drift). */
function isoDays(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * A board row for EVERY day of `[from, to]`: the dates in `droveKm` are
 * `drove` with that km, every other day is `idle` (checked, 0 km).
 */
function fill(
  from: string,
  to: string,
  droveKm: Record<string, number> = {},
): BoardDay[] {
  return isoDays(from, to).map((date): BoardDay => {
    const km = droveKm[date];
    return km === undefined
      ? { date, state: 'idle', km: null }
      : { date, state: 'drove', km };
  });
}

/** Run the real engine — so `yearMonth` / `saturdayDays` are exactly what the api feeds. */
function calc(
  dateStart: string,
  dateEnd: string,
  limits: Record<string, MonthLimit>,
  times: { timeFrom?: string; timeTo?: string } = {},
): KmCalcResult {
  return calcKmGwarantPerMonth({
    dateStart,
    dateEnd,
    limits,
    fallback: FALLBACK,
    timeFrom: times.timeFrom ?? null,
    timeTo: times.timeTo ?? null,
  });
}

/** Settlement input built from an engine result + the claim period. */
function inputFrom(
  result: KmCalcResult,
  dateStart: string,
  dateEnd: string,
  board: readonly BoardDay[],
  mileage = 6_000,
): ClaimSettlementInput {
  return {
    breakdown: result.breakdown,
    mileage,
    kmGuaranteed: result.kmGuaranteed,
    ratePerKmEffective: result.ratePerKmEffective,
    dateStart,
    dateEnd,
    board,
  };
}

/** A board that throws on ANY access — proves the declared path never reads it. */
function poisonedBoard(): readonly BoardDay[] {
  return new Proxy([] as BoardDay[], {
    get() {
      throw new Error('the board must not be read for an all-active period');
    },
    has() {
      throw new Error('the board must not be read for an all-active period');
    },
    ownKeys() {
      throw new Error('the board must not be read for an all-active period');
    },
  });
}

/** Hand-made input for the declared path (period dates are irrelevant there). */
function declaredInput(
  overrides: Partial<ClaimSettlementInput>,
): ClaimSettlementInput {
  return {
    breakdown: [],
    mileage: 0,
    kmGuaranteed: 0,
    ratePerKmEffective: 0.5,
    dateStart: '2026-05-01',
    dateEnd: '2026-05-20',
    board: poisonedBoard(),
    ...overrides,
  };
}

// ─── A. every month active ───────────────────────────────

describe('settleClaim — every month active (identity with the legacy formula)', () => {
  it('A1. single active month reproduces `kmGuaranteed − mileage` exactly, board untouched', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [active(20, { yearMonth: '2026-05' })],
        mileage: 8_000,
        kmGuaranteed: 10_800,
      }),
    );
    expect(out).toEqual({
      daysActive: 20,
      daysTotal: 20,
      mileageEffective: 8_000,
      kmDifference: 2_800,
      paymentEur: 1_400,
      hasDisabledMonths: false,
      mileageSource: 'declared',
      board: null,
    });
    expect({
      kmDifference: out.kmDifference,
      paymentEur: out.paymentEur,
    }).toEqual(legacySettlement(10_800, 8_000, 0.5));
  });

  it('A2. two active months (incl. credited Saturdays) reproduce the legacy numbers', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [
          active(18, {
            yearMonth: '2026-05',
            kmPerSaturday: 270,
            saturdaysCounted: 2,
            saturdayDays: ['2026-05-02', '2026-05-16'],
          }),
          active(10, { yearMonth: '2026-06' }),
        ],
        mileage: 12_345.67,
        kmGuaranteed: 15_660,
        ratePerKmEffective: 0.48,
      }),
    );
    expect(out.daysActive).toBe(30);
    expect(out.daysTotal).toBe(30);
    // Untouched mileage — handed through, never re-multiplied.
    expect(out.mileageEffective).toBe(12_345.67);
    expect({
      kmDifference: out.kmDifference,
      paymentEur: out.paymentEur,
    }).toEqual(legacySettlement(15_660, 12_345.67, 0.48));
    expect(out.mileageSource).toBe('declared');
    expect(out.board).toBeNull();
  });

  it('A3. a real engine result over an all-active period stays on the declared mileage', () => {
    const result = calc('2025-09-01', '2025-10-10', {
      '2025-09': ON,
      '2025-10': ON,
    });
    const out = settleClaim(
      inputFrom(result, '2025-09-01', '2025-10-10', poisonedBoard(), 9_999),
    );
    expect(out.mileageSource).toBe('declared');
    expect(out.mileageEffective).toBe(9_999);
    expect({
      kmDifference: out.kmDifference,
      paymentEur: out.paymentEur,
    }).toEqual(legacySettlement(result.kmGuaranteed, 9_999, result.ratePerKmEffective));
  });

  it('A4. carrier out-drove the guarantee ⇒ negative difference, zero payout', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [active(20, { yearMonth: '2026-05' })],
        mileage: 15_000,
        kmGuaranteed: 10_800,
      }),
    );
    expect(out.kmDifference).toBe(-4_200);
    expect(out.paymentEur).toBe(0);
  });

  it('A5. paymentEur rounds half-up at the cent', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [active(2, { yearMonth: '2026-05' })],
        mileage: 0,
        kmGuaranteed: 1.01,
      }),
    );
    // 1.01 × 0.5 = 0.505 → 0.51
    expect(out.paymentEur).toBe(0.51);
  });

  it('A6. empty breakdown behaves like the legacy formula (declared, no board)', () => {
    const out = settleClaim(
      declaredInput({ breakdown: [], mileage: 4_200, kmGuaranteed: 0 }),
    );
    expect(out.daysActive).toBe(0);
    expect(out.daysTotal).toBe(0);
    expect(out.mileageEffective).toBe(4_200);
    expect(out.kmDifference).toBe(-4_200);
    expect(out.paymentEur).toBe(0);
    expect(out.hasDisabledMonths).toBe(false);
    expect(out.mileageSource).toBe('declared');
  });

  it('A7. legacy row without Saturday fields is read as "no Saturdays"', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [{ kmPerDay: 540, workingDays: 20 }],
        mileage: 8_000,
        kmGuaranteed: 10_800,
      }),
    );
    expect(out.daysActive).toBe(20);
    expect(out.daysTotal).toBe(20);
    expect(out.mileageEffective).toBe(8_000);
    expect(out.hasDisabledMonths).toBe(false);
  });

  it('A8. legacy row WITHOUT `yearMonth` is treated as active — never switches to the board', () => {
    const legacy: SettlementMonth[] = [{ kmPerDay: 0, workingDays: 10 }];
    expect(settlementNeedsBoard(legacy)).toBe(false);
    const out = settleClaim(
      declaredInput({ breakdown: legacy, mileage: 3_000, kmGuaranteed: 0 }),
    );
    expect(out.mileageSource).toBe('declared');
    expect(out.mileageEffective).toBe(3_000);
    // The day counters keep their meaning regardless of the source.
    expect(out.daysActive).toBe(0);
    expect(out.hasDisabledMonths).toBe(true);
  });
});

// ─── B. spec example (docs/20 §0⁵) ───────────────────────

describe('settleClaim — spec example 21.08–18.09.2025 (August off, September on)', () => {
  const START = '2025-08-21';
  const END = '2025-09-18';
  const SPEC = calc(START, END, { '2025-08': OFF, '2025-09': ON });

  it('B0. the engine prices it as the spec says: 7 August days, 14 × 540 = 7560 km @ 0.50', () => {
    expect(SPEC.breakdown.map((m) => m.yearMonth)).toEqual(['2025-08', '2025-09']);
    expect(SPEC.breakdown[0]!.workingDays).toBe(7);
    expect(SPEC.breakdown[0]!.kmInMonth).toBe(0);
    expect(SPEC.breakdown[1]!.workingDays).toBe(14);
    expect(SPEC.kmGuaranteed).toBe(7_560);
    expect(SPEC.ratePerKmEffective).toBe(0.5);
    expect(settlementNeedsBoard(SPEC.breakdown)).toBe(true);
  });

  it('B1. board Aug 4000 / Sep 2000 ⇒ mileageEffective 2000, kmDifference 5560, 2780 €', () => {
    const board = [
      ...fill('2025-08-21', '2025-08-31', {
        '2025-08-21': 1_000,
        '2025-08-22': 1_000,
        '2025-08-25': 1_000,
        '2025-08-26': 1_000,
      }),
      ...fill('2025-09-01', END, {
        '2025-09-01': 500,
        '2025-09-02': 500,
        '2025-09-03': 500,
        '2025-09-04': 500,
      }),
    ];
    const out = settleClaim(inputFrom(SPEC, START, END, board, 6_000));

    expect(out.mileageSource).toBe('board');
    expect(out.mileageEffective).toBe(2_000);
    expect(out.kmDifference).toBe(5_560);
    expect(out.paymentEur).toBe(2_780);
    expect(out.board).toEqual({
      months: [
        {
          yearMonth: '2025-08',
          mode: 'off',
          km: 0,
          daysFilled: 0,
          daysRequired: 0,
          missingDates: [],
        },
        {
          yearMonth: '2025-09',
          mode: 'active',
          km: 2_000,
          daysFilled: 18,
          daysRequired: 18,
          missingDates: [],
        },
      ],
      missingDates: [],
      complete: true,
    });
  });

  it('B2. board Aug 500 / Sep 5500 ⇒ 1030 € (the proportion used to overpay 1780 €)', () => {
    const board = [
      ...fill('2025-08-21', '2025-08-31', { '2025-08-22': 500 }),
      ...fill(
        '2025-09-01',
        END,
        Object.fromEntries(
          isoDays('2025-09-01', '2025-09-11').map((d) => [d, 500] as const),
        ),
      ),
    ];
    const out = settleClaim(inputFrom(SPEC, START, END, board, 6_000));

    expect(out.mileageEffective).toBe(5_500);
    expect(out.kmDifference).toBe(2_060);
    expect(out.paymentEur).toBe(1_030);
  });

  it('B3. the carrier-declared mileage no longer affects the payout', () => {
    const board = fill('2025-09-01', END, { '2025-09-01': 2_000 });
    const low = settleClaim(inputFrom(SPEC, START, END, board, 1));
    const high = settleClaim(inputFrom(SPEC, START, END, board, 99_999));
    expect(low.paymentEur).toBe(2_780);
    expect(high.paymentEur).toBe(2_780);
    expect(low.mileageEffective).toBe(high.mileageEffective);
  });
});

// ─── C. off + on in both directions ──────────────────────

describe('settleClaim — mixed periods in both directions', () => {
  it('C1. active August, switched-off September: only August km are charged', () => {
    const result = calc('2025-08-21', '2025-09-18', {
      '2025-08': ON,
      '2025-09': OFF,
    });
    // 7 August weekdays × 540.
    expect(result.kmGuaranteed).toBe(3_780);
    const board = [
      ...fill('2025-08-21', '2025-08-31', {
        '2025-08-21': 1_500,
        '2025-08-22': 1_500,
      }),
      // September is off — heavy driving there must not eat August's guarantee.
      ...fill('2025-09-01', '2025-09-18', { '2025-09-01': 9_000 }),
    ];
    const out = settleClaim(
      inputFrom(result, '2025-08-21', '2025-09-18', board),
    );
    expect(out.mileageEffective).toBe(3_000);
    expect(out.kmDifference).toBe(780);
    expect(out.paymentEur).toBe(390);
    expect(out.board!.months.map((m) => [m.yearMonth, m.mode])).toEqual([
      ['2025-08', 'active'],
      ['2025-09', 'off'],
    ]);
    // Every calendar day 21..31 August is required (weekends included).
    expect(out.board!.months[0]!.daysRequired).toBe(11);
  });

  it('C2. a period made only of switched-off months: board path, nothing required, nothing paid', () => {
    const result = calc('2025-08-21', '2025-09-18', {
      '2025-08': OFF,
      '2025-09': OFF,
    });
    const out = settleClaim(inputFrom(result, '2025-08-21', '2025-09-18', []));
    expect(out.mileageSource).toBe('board');
    expect(out.mileageEffective).toBe(0);
    expect(out.kmDifference).toBe(0);
    expect(out.paymentEur).toBe(0);
    expect(out.board!.months.every((m) => m.mode === 'off')).toBe(true);
    expect(out.board!.months.every((m) => m.daysRequired === 0)).toBe(true);
    expect(out.board!.complete).toBe(true);
    // The day counters keep their pre-board meaning.
    expect(out.daysActive).toBe(0);
    expect(out.daysTotal).toBe(21);
    expect(out.hasDisabledMonths).toBe(true);
  });
});

// ─── D. gaps ─────────────────────────────────────────────

describe('settleClaim — days without a board row', () => {
  const START = '2025-08-21';
  const END = '2025-09-18';
  const SPEC = calc(START, END, { '2025-08': OFF, '2025-09': ON });

  it('D1. a gap in a switched-off month does not block: no rows for August at all', () => {
    const board = fill('2025-09-01', END, { '2025-09-02': 2_000 });
    const out = settleClaim(inputFrom(SPEC, START, END, board));
    expect(out.board!.complete).toBe(true);
    expect(out.board!.missingDates).toEqual([]);
    expect(out.board!.months[0]!.missingDates).toEqual([]);
    expect(out.paymentEur).toBe(2_780);
  });

  it('D2. a gap in an active month is reported with its dates and counts 0 km (no guessing)', () => {
    const board = fill('2025-09-01', END, {
      '2025-09-01': 1_000,
      '2025-09-02': 1_000,
    }).filter((row) => row.date !== '2025-09-07' && row.date !== END);
    const out = settleClaim(inputFrom(SPEC, START, END, board));

    const september = out.board!.months[1]!;
    expect(september.missingDates).toEqual(['2025-09-07', '2025-09-18']);
    expect(september.daysRequired).toBe(18);
    expect(september.daysFilled).toBe(16);
    expect(out.board!.missingDates).toEqual(['2025-09-07', '2025-09-18']);
    expect(out.board!.complete).toBe(false);
    // Only what is on the board is charged — the missing days add nothing.
    expect(out.mileageEffective).toBe(2_000);
    expect(out.paymentEur).toBe(2_780);
  });
});

// ─── E. tylko soboty ─────────────────────────────────────

describe('settleClaim — "Saturdays only" month', () => {
  // August 2025: Saturdays 2, 9, 16, 23, 30 → ordinals 1..5; in the period
  // (21..31) only the 30th (5th, odd) is credited, the 23rd (4th) is not.
  const START = '2025-08-21';
  const END = '2025-09-18';
  const RESULT = calc(START, END, { '2025-08': SAT_ONLY, '2025-09': ON });
  const SEPTEMBER = fill('2025-09-01', END, { '2025-09-01': 5_000 });

  it('E0. the engine credits exactly one August Saturday', () => {
    expect(RESULT.breakdown[0]!.saturdayDays).toEqual(['2025-08-30']);
    expect(RESULT.kmGuaranteed).toBe(270 + 7_560);
    expect(settlementMonthMode(RESULT.breakdown[0]!)).toBe('saturdaysOnly');
  });

  it('E1. with a row on the credited Saturday: only that Saturday\'s km count for August', () => {
    const board = [
      // Weekday + non-credited Saturday km of a Saturdays-only month: NOT charged.
      ...fill('2025-08-21', '2025-08-29', {
        '2025-08-21': 1_000,
        '2025-08-22': 1_000,
        '2025-08-23': 800,
      }),
      { date: '2025-08-30', state: 'drove' as const, km: 600 },
      ...SEPTEMBER,
    ];
    const out = settleClaim(inputFrom(RESULT, START, END, board));

    expect(out.board!.months[0]).toEqual({
      yearMonth: '2025-08',
      mode: 'saturdaysOnly',
      km: 600,
      daysFilled: 1,
      daysRequired: 1,
      missingDates: [],
    });
    expect(out.mileageEffective).toBe(5_600);
    expect(out.kmDifference).toBe(2_230);
    expect(out.paymentEur).toBe(1_115);
    expect(out.board!.complete).toBe(true);
  });

  it('E2. without a row on the credited Saturday: reported missing, weekday rows do not help', () => {
    const board = [
      ...fill('2025-08-21', '2025-08-29', { '2025-08-21': 1_000 }),
      ...SEPTEMBER,
    ];
    const out = settleClaim(inputFrom(RESULT, START, END, board));

    expect(out.board!.months[0]!.km).toBe(0);
    expect(out.board!.months[0]!.daysFilled).toBe(0);
    expect(out.board!.months[0]!.missingDates).toEqual(['2025-08-30']);
    expect(out.board!.missingDates).toEqual(['2025-08-30']);
    expect(out.board!.complete).toBe(false);
    expect(out.mileageEffective).toBe(5_000);
  });
});

// ─── F. what counts in an active month ───────────────────

describe('settleClaim — every calendar day of an active month counts', () => {
  it('F1. Sunday, EU-ban holiday and non-credited Saturday km are charged in an active month', () => {
    // 15.08.2025 (Fri) is «Wniebowziecie NMP» — excluded from the guarantee,
    // but whatever was driven that day is still driven kilometres.
    const result = calc('2025-08-11', '2025-09-05', {
      '2025-08': ON,
      '2025-09': OFF,
    });
    expect(result.breakdown[0]!.excludedDays.map((d) => d.date)).toContain(
      '2025-08-15',
    );
    const board = [
      ...fill('2025-08-11', '2025-08-31', {
        '2025-08-15': 300, // holiday
        '2025-08-16': 200, // Saturday (feature off — not credited)
        '2025-08-17': 450, // Sunday
      }),
      ...fill('2025-09-01', '2025-09-05', { '2025-09-01': 1_000 }),
    ];
    const out = settleClaim(inputFrom(result, '2025-08-11', '2025-09-05', board));

    expect(out.board!.months[0]!.km).toBe(950);
    expect(out.board!.months[0]!.daysRequired).toBe(21); // 11..31 August
    expect(out.mileageEffective).toBe(950);
    expect(out.kmDifference).toBe(result.kmGuaranteed - 950);
  });

  it('F2. the first and last day count in full whatever timeFrom / timeTo', () => {
    // 28.07.2025 (Mon) from 18:00 and 05.09.2025 (Fri) until 06:00: the
    // guarantee credits a quarter of each boundary day, the km count whole.
    const result = calc(
      '2025-07-28',
      '2025-09-05',
      { '2025-07': ON, '2025-08': OFF, '2025-09': ON },
      { timeFrom: '18:00', timeTo: '06:00' },
    );
    expect(result.firstDay).toEqual({ date: '2025-07-28', fraction: 0.25 });
    expect(result.lastDay).toEqual({ date: '2025-09-05', fraction: 0.25 });
    // July 3.25 d × 540 = 1755, September 4.25 d × 540 = 2295.
    expect(result.kmGuaranteed).toBe(4_050);

    const board = [
      ...fill('2025-07-28', '2025-07-31', { '2025-07-28': 800 }),
      ...fill('2025-09-01', '2025-09-05', { '2025-09-05': 700 }),
    ];
    const out = settleClaim(inputFrom(result, '2025-07-28', '2025-09-05', board));

    expect(out.board!.months.map((m) => [m.yearMonth, m.km])).toEqual([
      ['2025-07', 800],
      ['2025-08', 0],
      ['2025-09', 700],
    ]);
    expect(out.mileageEffective).toBe(1_500);
    expect(out.kmDifference).toBe(2_550);
    expect(out.paymentEur).toBe(1_275);
    expect(out.board!.complete).toBe(true);
  });
});

// ─── G. row kinds ────────────────────────────────────────

describe('settleClaim — board row kinds', () => {
  const START = '2025-08-21';
  const END = '2025-09-18';
  const SPEC = calc(START, END, { '2025-08': OFF, '2025-09': ON });

  it('G1. `idle` rows count as filled days with 0 km', () => {
    const out = settleClaim(inputFrom(SPEC, START, END, fill('2025-09-01', END)));
    expect(out.board!.months[1]!.daysFilled).toBe(18);
    expect(out.board!.months[1]!.km).toBe(0);
    expect(out.board!.complete).toBe(true);
    expect(out.mileageEffective).toBe(0);
    expect(out.paymentEur).toBe(3_780);
  });

  it('G2. a `drove` row with `km = null` is filled and contributes 0 km', () => {
    const board = fill('2025-09-01', END, { '2025-09-01': 1_200 }).map(
      (row): BoardDay =>
        row.date === '2025-09-02' ? { date: row.date, state: 'drove', km: null } : row,
    );
    const out = settleClaim(inputFrom(SPEC, START, END, board));
    expect(out.board!.months[1]!.daysFilled).toBe(18);
    expect(out.board!.complete).toBe(true);
    expect(out.mileageEffective).toBe(1_200);
  });

  it('G3. an empty board: every counted day missing, the guarantee is not charged at all', () => {
    const out = settleClaim(inputFrom(SPEC, START, END, []));
    expect(out.mileageSource).toBe('board');
    expect(out.board!.missingDates).toEqual(isoDays('2025-09-01', END));
    expect(out.board!.complete).toBe(false);
    expect(out.mileageEffective).toBe(0);
    expect(out.kmDifference).toBe(7_560);
    expect(out.paymentEur).toBe(3_780);
  });

  it('G4. rows outside the period are ignored', () => {
    const board = [
      { date: '2025-09-19', state: 'drove' as const, km: 5_000 },
      ...fill('2025-09-01', END, { '2025-09-01': 1_000 }),
    ];
    const out = settleClaim(inputFrom(SPEC, START, END, board));
    expect(out.mileageEffective).toBe(1_000);
  });
});

// ─── H. calendar walk ────────────────────────────────────

describe('settleClaim — calendar walk (pure arithmetic)', () => {
  it('H1. crosses the year boundary', () => {
    const out = settleClaim({
      breakdown: [
        disabled(3, { yearMonth: '2025-12' }),
        active(2, { yearMonth: '2026-01' }),
      ],
      mileage: 0,
      kmGuaranteed: 1_080,
      ratePerKmEffective: 0.5,
      dateStart: '2025-12-29',
      dateEnd: '2026-01-03',
      board: [],
    });
    expect(out.board!.months.map((m) => [m.yearMonth, m.mode, m.daysRequired])).toEqual([
      ['2025-12', 'off', 0],
      ['2026-01', 'active', 3],
    ]);
    expect(out.board!.missingDates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('H2. includes the leap day', () => {
    const out = settleClaim({
      breakdown: [
        active(2, { yearMonth: '2028-02' }),
        disabled(2, { yearMonth: '2028-03' }),
      ],
      mileage: 0,
      kmGuaranteed: 1_080,
      ratePerKmEffective: 0.5,
      dateStart: '2028-02-27',
      dateEnd: '2028-03-02',
      board: [],
    });
    expect(out.board!.months[0]!.missingDates).toEqual([
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
    ]);
  });

  it('H3. a month of the period with no breakdown row is treated as active', () => {
    const out = settleClaim({
      breakdown: [disabled(5, { yearMonth: '2025-08' })],
      mileage: 0,
      kmGuaranteed: 0,
      ratePerKmEffective: 0.5,
      dateStart: '2025-08-30',
      dateEnd: '2025-09-01',
      board: [{ date: '2025-09-01', state: 'drove', km: 300 }],
    });
    expect(out.board!.months[1]).toMatchObject({
      yearMonth: '2025-09',
      mode: 'active',
      km: 300,
      daysRequired: 1,
    });
  });

  it('H4. an invalid period yields no months (and never throws)', () => {
    const out = settleClaim({
      breakdown: [disabled(5, { yearMonth: '2025-08' })],
      mileage: 0,
      kmGuaranteed: 0,
      ratePerKmEffective: 0.5,
      dateStart: '2025-02-30',
      dateEnd: '2025-03-02',
      board: [],
    });
    expect(out.board).toEqual({ months: [], missingDates: [], complete: true });
  });
});

// ─── I. day counters keep their meaning ──────────────────

describe('settleClaim — daysActive / daysTotal / hasDisabledMonths', () => {
  it('I1. "Saturdays only": weekdays not active, Saturdays active, hint raised', () => {
    const sat: SettlementMonth = {
      yearMonth: '2026-02',
      kmPerDay: 0,
      kmPerSaturday: 270,
      workingDays: 18,
      saturdaysCounted: 2,
      saturdayDays: ['2026-02-07', '2026-02-21'],
    };
    const out = settleClaim({
      breakdown: [sat, active(10, { yearMonth: '2026-03' })],
      mileage: 6_000,
      kmGuaranteed: 5_940,
      ratePerKmEffective: 0.5,
      dateStart: '2026-02-01',
      dateEnd: '2026-03-13',
      board: [],
    });
    expect(out.daysTotal).toBe(30);
    expect(out.daysActive).toBe(12);
    expect(isMonthActive(sat)).toBe(true);
    expect(out.hasDisabledMonths).toBe(true);
  });

  it('I2. a disabled month that contributed no counted days still raises the hint', () => {
    const out = settleClaim({
      breakdown: [
        active(20, { yearMonth: '2026-05' }),
        disabled(0, { yearMonth: '2026-06' }),
      ],
      mileage: 8_000,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
      dateStart: '2026-05-04',
      dateEnd: '2026-06-01',
      board: [],
    });
    expect(out.daysActive).toBe(20);
    expect(out.daysTotal).toBe(20);
    expect(out.hasDisabledMonths).toBe(true);
    expect(out.mileageSource).toBe('board');
  });

  it('I3. fractional working days round to 2 dp', () => {
    const out = settleClaim({
      breakdown: [
        active(9.58, { yearMonth: '2026-05' }),
        disabled(5.25, { yearMonth: '2026-06' }),
      ],
      mileage: 7_000,
      kmGuaranteed: 5_173,
      ratePerKmEffective: 0.5,
      dateStart: '2026-05-18',
      dateEnd: '2026-06-05',
      board: [],
    });
    expect(out.daysActive).toBe(9.58);
    expect(out.daysTotal).toBe(14.83);
  });
});

describe('settlementNeedsBoard / settlementMonthMode', () => {
  it('classifies months by their limits', () => {
    expect(settlementMonthMode({ kmPerDay: 540, workingDays: 1 })).toBe('active');
    expect(
      settlementMonthMode({ kmPerDay: 0, kmPerSaturday: 270, workingDays: 1 }),
    ).toBe('saturdaysOnly');
    expect(settlementMonthMode({ kmPerDay: 0, workingDays: 1 })).toBe('off');
    // Non-finite limits collapse to 0 — not a guarantee.
    expect(settlementMonthMode({ kmPerDay: Number.NaN, workingDays: 1 })).toBe('off');
  });

  it('needs the board as soon as one dated month has kmPerDay = 0', () => {
    expect(settlementNeedsBoard([])).toBe(false);
    expect(
      settlementNeedsBoard([active(10, { yearMonth: '2026-05' })]),
    ).toBe(false);
    expect(
      settlementNeedsBoard([
        active(10, { yearMonth: '2026-05' }),
        disabled(10, { yearMonth: '2026-06' }),
      ]),
    ).toBe(true);
    expect(
      settlementNeedsBoard([
        { yearMonth: '2026-06', kmPerDay: 0, kmPerSaturday: 270, workingDays: 0 },
      ]),
    ).toBe(true);
  });
});

// ─── J. limits snapshot + engine pin ─────────────────────

describe('limitsSnapshotFromBreakdown', () => {
  it('rebuilds a `YYYY-MM → MonthLimit` map from a persisted breakdown', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [
        { yearMonth: '2026-05', kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
        { yearMonth: '2026-06', kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
      ],
    });
    expect(snapshot).toEqual({
      '2026-05': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
      // A deliberate zero survives the round-trip — that is the whole point.
      '2026-06': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
  });

  it('ignores the envelope-level `mileageSource` (and every other non-limit key)', () => {
    const envelope = {
      mileageSource: 'board' as const,
      mileageEffective: 2_000,
      daysActive: 14,
      breakdown: [{ yearMonth: '2025-09', kmPerDay: 540, ratePerKm: 0.5 }],
    };
    expect(limitsSnapshotFromBreakdown(envelope)).toEqual({
      '2025-09': { kmPerDay: 540, ratePerKm: 0.5 },
    });
  });

  it('omits `kmPerSaturday` for legacy rows that predate the field', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [{ yearMonth: '2026-05', kmPerDay: 540, ratePerKm: 0.5 }],
    });
    expect(snapshot['2026-05']).toEqual({ kmPerDay: 540, ratePerKm: 0.5 });
    expect('kmPerSaturday' in snapshot['2026-05']!).toBe(false);
  });

  it('returns {} for null / missing / malformed envelopes', () => {
    expect(limitsSnapshotFromBreakdown(null)).toEqual({});
    expect(limitsSnapshotFromBreakdown(undefined)).toEqual({});
    expect(limitsSnapshotFromBreakdown({})).toEqual({});
    expect(limitsSnapshotFromBreakdown({ breakdown: null })).toEqual({});
  });

  it('drops rows with a bad key or non-numeric limits', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [
        { yearMonth: '2026-13', kmPerDay: 540, ratePerKm: 0.5 },
        { yearMonth: '2026-05', kmPerDay: null, ratePerKm: 0.5 },
        { yearMonth: '2026-06', kmPerDay: 540, ratePerKm: 'x' },
        { yearMonth: '2026-07', kmPerDay: 540, ratePerKm: 0.5 },
      ],
    });
    expect(Object.keys(snapshot)).toEqual(['2026-07']);
  });
});

describe('engine pin — FALLBACK_KM_PER_SATURDAY must stay 0', () => {
  // `resolveKmPerSaturday` in the (frozen) engine treats a month value of `0`
  // as "not set" and falls through to the global fallback. As long as that
  // fallback is 0 the behaviour is indistinguishable from "switched off" — but
  // the day someone gives it a positive default, EVERY month that explicitly
  // disabled its Saturdays silently switches them back on. These two fixtures
  // lock the semantics; the api-side constant carries the matching warning.
  const BASE = {
    // 2026-05-02 is the 1st Saturday of the month (odd ordinal ⇒ qualifying).
    dateStart: '2026-05-01',
    dateEnd: '2026-05-04',
    limits: {
      '2026-05': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    } as Record<string, MonthLimit>,
  };

  it('explicit `kmPerSaturday: 0` + fallback 0 ⇒ Saturdays stay excluded', () => {
    const res = calcKmGwarantPerMonth({
      ...BASE,
      fallback: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
    expect(res.breakdown[0]!.saturdaysCounted).toBe(0);
    expect(res.breakdown[0]!.kmPerSaturday).toBe(0);
  });

  it('REGRESSION TRIPWIRE: a positive fallback would re-enable disabled Saturdays', () => {
    const res = calcKmGwarantPerMonth({
      ...BASE,
      // Simulates someone changing FALLBACK_KM_PER_SATURDAY to 270.
      fallback: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
    });
    // This is NOT desired behaviour — it is the failure mode the pin prevents.
    // If this expectation ever needs changing, the engine's fall-through was
    // fixed and the api constant may finally be made configurable.
    expect(res.breakdown[0]!.saturdaysCounted).toBe(1);
    expect(res.breakdown[0]!.kmPerSaturday).toBe(270);
  });
});
