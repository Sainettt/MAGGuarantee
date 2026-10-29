// Fixture suite for `settleClaim` + `limitsSnapshotFromBreakdown`
// (`src/domain/claim-settlement.ts`) — the payout layer, per ISO week since
// 2026-10-29 (docs/01-overview.md §«Расчёт доплаты»), settled on the
// weryfikator's daily-km board for mixed periods (docs/20 §0⁵).
//
// Two invariants every fixture is written around:
//   1. while every week of the period has its weekday guarantee on, the
//      settlement is the plain `kmGuaranteed − mileage` bit-for-bit and never
//      even looks at the board;
//   2. once a week has `kmPerDay = 0`, the kilometres charged are the board's
//      `drove` km on the counted days of the guaranteed weeks — the carrier's
//      `mileage` no longer affects the payout, and a counted day without a
//      board row is reported, never guessed.
//
// Calendar: 2026-W23 = 01.06–07.06 (02.06, 04.06 bans), W24 = 08.06–14.06,
// W25 = 15.06–21.06, W26 = 22.06–28.06.
//
// Coverage:
//   A  all active                      identity, board never read
//   B  docs/01 example                 08.06–21.06.2026: 600 € and 0 €
//   C  off + on, both directions        active→off, all off
//   D  gaps                             off week (no block), active week (dates)
//   E  tylko sobota                     credited Saturday with / without a row,
//                                       Saturday outside the period
//   F  what counts in an active week    Sunday / holiday / plain Saturday,
//                                       first / last day in full
//   G  row kinds                        idle = filled, drove km null, empty board
//   H  calendar walk                    ISO-year boundary, W01 in December,
//                                       leap day, week without a row, bad period
//   I  day counters                     daysActive / daysTotal / hasDisabledWeeks
//   J  `limitsSnapshotFromBreakdown` + the FALLBACK_KM_PER_SATURDAY engine pin

import { describe, expect, it } from 'vitest';

import {
  FALLBACK_WEEK_LIMIT,
  calcKmGwarant,
  type KmCalcResult,
  type WeekLimit,
} from '../src/domain/km-calc';
import {
  isWeekActive,
  limitsSnapshotFromBreakdown,
  settleClaim,
  settlementNeedsBoard,
  settlementWeekMode,
  type BoardDay,
  type ClaimSettlementInput,
  type SettlementWeek,
} from '../src/domain/claim-settlement';

// ─── helpers ─────────────────────────────────────────────

/** Week with the weekday guarantee ON. */
const ON: WeekLimit = { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 };
/** Week explicitly switched OFF (0 / 0). */
const OFF: WeekLimit = { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 };
/** "Tylko sobota": weekdays off, the week's Saturday at 270 km. */
const SAT_ONLY: WeekLimit = { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 270 };

/** Hand-made active week row (no calendar needed for the declared path). */
function active(
  isoWeek: string,
  workingDays: number,
  overrides: Partial<SettlementWeek> = {},
): SettlementWeek {
  return {
    isoWeek,
    kmPerDay: 540,
    kmPerSaturday: 0,
    workingDays,
    saturdaysCounted: 0,
    saturdayDays: [],
    ...overrides,
  };
}

/** Hand-made week row with the guarantee switched OFF (0 / 0). */
function disabled(
  isoWeek: string,
  workingDays: number,
  overrides: Partial<SettlementWeek> = {},
): SettlementWeek {
  return active(isoWeek, workingDays, { kmPerDay: 0, ...overrides });
}

/** The plain formula, kept as the oracle for the identity tests. */
function plainSettlement(
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

/** Run the real engine — so `isoWeek` / `saturdayDays` are exactly what the api feeds. */
function calc(
  dateStart: string,
  dateEnd: string,
  limits: Record<string, WeekLimit>,
  times: { timeFrom?: string; timeTo?: string } = {},
): KmCalcResult {
  return calcKmGwarant({
    dateStart,
    dateEnd,
    limits,
    fallback: FALLBACK_WEEK_LIMIT,
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
  mileage = 3_500,
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
  const fail = (): never => {
    throw new Error('the board must not be read for an all-active period');
  };
  return new Proxy([] as BoardDay[], { get: fail, has: fail, ownKeys: fail });
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
    dateStart: '2026-06-08',
    dateEnd: '2026-06-21',
    board: poisonedBoard(),
    ...overrides,
  };
}

// ─── A. every week active ────────────────────────────────

describe('settleClaim — every week active (identity with the plain formula)', () => {
  it('A1. single active week reproduces `kmGuaranteed − mileage` exactly, board untouched', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [active('2026-W24', 5)],
        mileage: 2_000,
        kmGuaranteed: 2_700,
      }),
    );
    expect(out).toEqual({
      daysActive: 5,
      daysTotal: 5,
      mileageEffective: 2_000,
      kmDifference: 700,
      paymentEur: 350,
      hasDisabledWeeks: false,
      mileageSource: 'declared',
      board: null,
    });
    expect({ kmDifference: out.kmDifference, paymentEur: out.paymentEur }).toEqual(
      plainSettlement(2_700, 2_000, 0.5),
    );
  });

  it('A2. two active weeks (incl. a credited Saturday) reproduce the plain numbers', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [
          active('2026-W24', 5, {
            kmPerSaturday: 270,
            saturdaysCounted: 1,
            saturdayDays: ['2026-06-13'],
          }),
          active('2026-W25', 5),
        ],
        mileage: 4_321.67,
        kmGuaranteed: 5_670,
        ratePerKmEffective: 0.48,
      }),
    );
    expect(out.daysActive).toBe(11);
    expect(out.daysTotal).toBe(11);
    // Untouched mileage — handed through, never re-multiplied.
    expect(out.mileageEffective).toBe(4_321.67);
    expect({ kmDifference: out.kmDifference, paymentEur: out.paymentEur }).toEqual(
      plainSettlement(5_670, 4_321.67, 0.48),
    );
    expect(out.mileageSource).toBe('declared');
    expect(out.board).toBeNull();
  });

  it('A3. a real engine result over an all-active 3-week period stays on the declared mileage', () => {
    const result = calc('2026-06-08', '2026-06-28', {
      '2026-W24': ON,
      '2026-W25': { kmPerDay: 500, ratePerKm: 0.6 },
      // W26 unconfigured ⇒ fallback 540 — still active.
    });
    const out = settleClaim(
      inputFrom(result, '2026-06-08', '2026-06-28', poisonedBoard(), 6_999),
    );
    expect(out.mileageSource).toBe('declared');
    expect(out.mileageEffective).toBe(6_999);
    expect({ kmDifference: out.kmDifference, paymentEur: out.paymentEur }).toEqual(
      plainSettlement(result.kmGuaranteed, 6_999, result.ratePerKmEffective),
    );
  });

  it('A4. carrier out-drove the guarantee ⇒ negative difference, zero payout', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [active('2026-W24', 5)],
        mileage: 4_000,
        kmGuaranteed: 2_700,
      }),
    );
    expect(out.kmDifference).toBe(-1_300);
    expect(out.paymentEur).toBe(0);
  });

  it('A5. paymentEur rounds half-up at the cent', () => {
    const out = settleClaim(
      declaredInput({
        breakdown: [active('2026-W24', 2)],
        mileage: 0,
        kmGuaranteed: 1.01,
      }),
    );
    // 1.01 × 0.5 = 0.505 → 0.51
    expect(out.paymentEur).toBe(0.51);
  });

  it('A6. empty breakdown behaves like the plain formula (declared, no board)', () => {
    const out = settleClaim(
      declaredInput({ breakdown: [], mileage: 4_200, kmGuaranteed: 0 }),
    );
    expect(out.daysActive).toBe(0);
    expect(out.daysTotal).toBe(0);
    expect(out.mileageEffective).toBe(4_200);
    expect(out.kmDifference).toBe(-4_200);
    expect(out.paymentEur).toBe(0);
    expect(out.hasDisabledWeeks).toBe(false);
    expect(out.mileageSource).toBe('declared');
  });
});

// ─── B. docs/01 example ──────────────────────────────────

describe('settleClaim — docs/01 example 08.06–21.06.2026 (W24 off, W25 on)', () => {
  const START = '2026-06-08';
  const END = '2026-06-21';
  const SPEC = calc(START, END, { '2026-W24': OFF, '2026-W25': ON });

  it('B0. the engine prices it as the spec says: W25 5 × 540 = 2700 km @ 0.50', () => {
    expect(SPEC.breakdown.map((w) => [w.isoWeek, w.workingDays, w.kmInWeek])).toEqual([
      ['2026-W24', 5, 0],
      ['2026-W25', 5, 2_700],
    ]);
    expect(SPEC.kmGuaranteed).toBe(2_700);
    expect(SPEC.ratePerKmEffective).toBe(0.5);
    expect(settlementNeedsBoard(SPEC.breakdown)).toBe(true);
  });

  it('B1. board W24 2000 / W25 1500 ⇒ mileageEffective 1500, roznica 1200, 600 €', () => {
    const board = [
      ...fill('2026-06-08', '2026-06-14', { '2026-06-08': 1_000, '2026-06-09': 1_000 }),
      ...fill('2026-06-15', END, { '2026-06-15': 750, '2026-06-16': 750 }),
    ];
    const out = settleClaim(inputFrom(SPEC, START, END, board, 3_500));

    expect(out.mileageSource).toBe('board');
    expect(out.mileageEffective).toBe(1_500);
    expect(out.kmDifference).toBe(1_200);
    expect(out.paymentEur).toBe(600);
    expect(out.board).toEqual({
      weeks: [
        {
          isoWeek: '2026-W24',
          mode: 'off',
          km: 0,
          daysFilled: 0,
          daysRequired: 0,
          missingDates: [],
        },
        {
          isoWeek: '2026-W25',
          mode: 'active',
          km: 1_500,
          daysFilled: 7,
          daysRequired: 7,
          missingDates: [],
        },
      ],
      missingDates: [],
      complete: true,
    });
  });

  it('B2. board W24 500 / W25 3000 ⇒ roznica −300, 0 €', () => {
    const board = [
      ...fill('2026-06-08', '2026-06-14', { '2026-06-10': 500 }),
      ...fill('2026-06-15', END, { '2026-06-15': 1_500, '2026-06-18': 1_500 }),
    ];
    const out = settleClaim(inputFrom(SPEC, START, END, board, 3_500));
    expect(out.mileageEffective).toBe(3_000);
    expect(out.kmDifference).toBe(-300);
    expect(out.paymentEur).toBe(0);
  });

  it('B3. the carrier-declared mileage no longer affects the payout', () => {
    const board = fill('2026-06-15', END, { '2026-06-15': 1_500 });
    const low = settleClaim(inputFrom(SPEC, START, END, board, 1));
    const high = settleClaim(inputFrom(SPEC, START, END, board, 99_999));
    expect(low.paymentEur).toBe(600);
    expect(high.paymentEur).toBe(600);
    expect(low.mileageEffective).toBe(high.mileageEffective);
  });
});

// ─── C. off + on in both directions ──────────────────────

describe('settleClaim — mixed periods in both directions', () => {
  it('C1. active W24, switched-off W25: only W24 km are charged, every W24 day required', () => {
    const result = calc('2026-06-08', '2026-06-21', { '2026-W24': ON, '2026-W25': OFF });
    expect(result.kmGuaranteed).toBe(2_700);
    const board = [
      ...fill('2026-06-08', '2026-06-14', { '2026-06-08': 1_000, '2026-06-09': 1_000 }),
      // W25 is off — heavy driving there must not eat W24's guarantee.
      ...fill('2026-06-15', '2026-06-21', { '2026-06-15': 9_000 }),
    ];
    const out = settleClaim(inputFrom(result, '2026-06-08', '2026-06-21', board));
    expect(out.mileageEffective).toBe(2_000);
    expect(out.kmDifference).toBe(700);
    expect(out.paymentEur).toBe(350);
    expect(out.board!.weeks.map((w) => [w.isoWeek, w.mode, w.daysRequired])).toEqual([
      ['2026-W24', 'active', 7], // weekend included
      ['2026-W25', 'off', 0],
    ]);
  });

  it('C2. a period made only of switched-off weeks: board path, nothing required, nothing paid', () => {
    const result = calc('2026-06-08', '2026-06-21', { '2026-W24': OFF, '2026-W25': OFF });
    const out = settleClaim(inputFrom(result, '2026-06-08', '2026-06-21', []));
    expect(out.mileageSource).toBe('board');
    expect(out.mileageEffective).toBe(0);
    expect(out.kmDifference).toBe(0);
    expect(out.paymentEur).toBe(0);
    expect(out.board!.weeks.every((w) => w.mode === 'off' && w.daysRequired === 0)).toBe(true);
    expect(out.board!.complete).toBe(true);
    // The day counters keep their meaning.
    expect(out.daysActive).toBe(0);
    expect(out.daysTotal).toBe(10);
    expect(out.hasDisabledWeeks).toBe(true);
  });
});

// ─── D. gaps ─────────────────────────────────────────────

describe('settleClaim — days without a board row', () => {
  const START = '2026-06-08';
  const END = '2026-06-21';
  const SPEC = calc(START, END, { '2026-W24': OFF, '2026-W25': ON });

  it('D1. a gap in a switched-off week does not block: no rows for W24 at all', () => {
    const board = fill('2026-06-15', END, { '2026-06-16': 1_500 });
    const out = settleClaim(inputFrom(SPEC, START, END, board));
    expect(out.board!.complete).toBe(true);
    expect(out.board!.weeks[0]!.missingDates).toEqual([]);
    expect(out.paymentEur).toBe(600);
  });

  it('D2. a gap in an active week is reported with its dates and counts 0 km (no guessing)', () => {
    const board = fill('2026-06-15', END, {
      '2026-06-15': 500,
      '2026-06-16': 500,
    }).filter((r) => r.date !== '2026-06-20' && r.date !== END);
    const out = settleClaim(inputFrom(SPEC, START, END, board));

    const w25 = out.board!.weeks[1]!;
    expect(w25.missingDates).toEqual(['2026-06-20', '2026-06-21']);
    expect(w25.daysRequired).toBe(7);
    expect(w25.daysFilled).toBe(5);
    expect(out.board!.missingDates).toEqual(['2026-06-20', '2026-06-21']);
    expect(out.board!.complete).toBe(false);
    // Only what is on the board is charged — the missing days add nothing.
    expect(out.mileageEffective).toBe(1_000);
    expect(out.paymentEur).toBe(850);
  });
});

// ─── E. tylko sobota ─────────────────────────────────────

describe('settleClaim — "Saturday only" week', () => {
  const START = '2026-06-08';
  const END = '2026-06-21';
  const RESULT = calc(START, END, { '2026-W24': SAT_ONLY, '2026-W25': ON });
  const W25 = fill('2026-06-15', END, { '2026-06-15': 1_000 });

  it('E0. the engine credits exactly the W24 Saturday', () => {
    expect(RESULT.breakdown[0]!.saturdayDays).toEqual(['2026-06-13']);
    expect(RESULT.kmGuaranteed).toBe(270 + 2_700);
    expect(settlementWeekMode(RESULT.breakdown[0]!)).toBe('saturdaysOnly');
  });

  it("E1. with a row on the credited Saturday: only that Saturday's km count for W24", () => {
    const board = [
      // Weekday + Sunday km of a Saturday-only week: NOT charged.
      ...fill('2026-06-08', '2026-06-12', { '2026-06-08': 1_000, '2026-06-09': 1_000 }),
      { date: '2026-06-13', state: 'drove' as const, km: 600 },
      { date: '2026-06-14', state: 'drove' as const, km: 800 },
      ...W25,
    ];
    const out = settleClaim(inputFrom(RESULT, START, END, board));

    expect(out.board!.weeks[0]).toEqual({
      isoWeek: '2026-W24',
      mode: 'saturdaysOnly',
      km: 600,
      daysFilled: 1,
      daysRequired: 1,
      missingDates: [],
    });
    expect(out.mileageEffective).toBe(1_600);
    expect(out.kmDifference).toBe(1_370);
    expect(out.paymentEur).toBe(685);
    expect(out.board!.complete).toBe(true);
  });

  it('E2. without a row on the credited Saturday: reported missing, weekday rows do not help', () => {
    const board = [...fill('2026-06-08', '2026-06-12', { '2026-06-08': 1_000 }), ...W25];
    const out = settleClaim(inputFrom(RESULT, START, END, board));
    expect(out.board!.weeks[0]!.km).toBe(0);
    expect(out.board!.weeks[0]!.missingDates).toEqual(['2026-06-13']);
    expect(out.board!.missingDates).toEqual(['2026-06-13']);
    expect(out.board!.complete).toBe(false);
    expect(out.mileageEffective).toBe(1_000);
  });

  it('E3. Saturday-only week whose Saturday is outside the period: nothing required', () => {
    // W26 ends on Thursday 25.06 — its Saturday 27.06 is outside the claim.
    const result = calc('2026-06-15', '2026-06-25', { '2026-W25': ON, '2026-W26': SAT_ONLY });
    const out = settleClaim(
      inputFrom(result, '2026-06-15', '2026-06-25', fill('2026-06-15', '2026-06-21')),
    );
    expect(out.board!.weeks[1]).toEqual({
      isoWeek: '2026-W26',
      mode: 'saturdaysOnly',
      km: 0,
      daysFilled: 0,
      daysRequired: 0,
      missingDates: [],
    });
    expect(out.board!.complete).toBe(true);
  });
});

// ─── F. what counts in an active week ────────────────────

describe('settleClaim — every calendar day of an active week counts', () => {
  it('F1. holiday, plain Saturday and Sunday km are charged in an active week', () => {
    // W23: 02.06 (IT) and 04.06 (Boze Cialo) are excluded from the guarantee,
    // but whatever was driven those days is still driven kilometres.
    const result = calc('2026-06-01', '2026-06-14', { '2026-W23': ON, '2026-W24': OFF });
    const board = [
      ...fill('2026-06-01', '2026-06-07', {
        '2026-06-02': 300, // holiday
        '2026-06-06': 200, // Saturday without guarantee
        '2026-06-07': 450, // Sunday
      }),
      ...fill('2026-06-08', '2026-06-14', { '2026-06-08': 1_000 }),
    ];
    const out = settleClaim(inputFrom(result, '2026-06-01', '2026-06-14', board));
    expect(out.board!.weeks[0]).toMatchObject({ km: 950, daysRequired: 7 });
    expect(out.mileageEffective).toBe(950);
    expect(out.kmDifference).toBe(result.kmGuaranteed - 950);
  });

  it('F2. the first and last day count in full whatever timeFrom / timeTo', () => {
    // Wed 03.06 from 18:00 and Fri 19.06 until 06:00: the guarantee credits a
    // quarter of each boundary day, the km count whole.
    const result = calc(
      '2026-06-03',
      '2026-06-19',
      { '2026-W23': ON, '2026-W24': OFF, '2026-W25': ON },
      { timeFrom: '18:00', timeTo: '06:00' },
    );
    expect(result.firstDay).toEqual({ date: '2026-06-03', fraction: 0.25 });
    expect(result.lastDay).toEqual({ date: '2026-06-19', fraction: 0.25 });
    // W23 1.25 d × 540 = 675 (04.06 excluded), W25 4.25 d × 540 = 2295.
    expect(result.kmGuaranteed).toBe(2_970);

    const board = [
      ...fill('2026-06-03', '2026-06-07', { '2026-06-03': 800 }),
      ...fill('2026-06-15', '2026-06-19', { '2026-06-19': 700 }),
    ];
    const out = settleClaim(inputFrom(result, '2026-06-03', '2026-06-19', board));
    expect(out.board!.weeks.map((w) => [w.isoWeek, w.km, w.daysRequired])).toEqual([
      ['2026-W23', 800, 5],
      ['2026-W24', 0, 0],
      ['2026-W25', 700, 5],
    ]);
    expect(out.mileageEffective).toBe(1_500);
    expect(out.kmDifference).toBe(1_470);
    expect(out.paymentEur).toBe(735);
    expect(out.board!.complete).toBe(true);
  });
});

// ─── G. row kinds ────────────────────────────────────────

describe('settleClaim — board row kinds', () => {
  const START = '2026-06-08';
  const END = '2026-06-21';
  const SPEC = calc(START, END, { '2026-W24': OFF, '2026-W25': ON });

  it('G1. `idle` rows count as filled days with 0 km', () => {
    const out = settleClaim(inputFrom(SPEC, START, END, fill('2026-06-15', END)));
    expect(out.board!.weeks[1]!.daysFilled).toBe(7);
    expect(out.board!.weeks[1]!.km).toBe(0);
    expect(out.board!.complete).toBe(true);
    expect(out.mileageEffective).toBe(0);
    expect(out.paymentEur).toBe(1_350);
  });

  it('G2. a `drove` row with `km = null` is filled and contributes 0 km', () => {
    const board = fill('2026-06-15', END, { '2026-06-15': 1_200 }).map(
      (r): BoardDay => (r.date === '2026-06-16' ? { date: r.date, state: 'drove', km: null } : r),
    );
    const out = settleClaim(inputFrom(SPEC, START, END, board));
    expect(out.board!.weeks[1]!.daysFilled).toBe(7);
    expect(out.board!.complete).toBe(true);
    expect(out.mileageEffective).toBe(1_200);
  });

  it('G3. an empty board: every counted day missing, the guarantee is not charged at all', () => {
    const out = settleClaim(inputFrom(SPEC, START, END, []));
    expect(out.mileageSource).toBe('board');
    expect(out.board!.missingDates).toEqual(isoDays('2026-06-15', END));
    expect(out.board!.complete).toBe(false);
    expect(out.mileageEffective).toBe(0);
    expect(out.kmDifference).toBe(2_700);
    expect(out.paymentEur).toBe(1_350);
  });

  it('G4. rows outside the period are ignored; datetime-shaped dates are read by day', () => {
    const board: BoardDay[] = [
      { date: '2026-06-22', state: 'drove', km: 5_000 },
      ...fill('2026-06-15', END, { '2026-06-15': 1_000 }).map((r) =>
        r.date === '2026-06-16' ? { ...r, date: '2026-06-16T00:00:00.000Z', state: 'drove' as const, km: 100 } : r,
      ),
    ];
    const out = settleClaim(inputFrom(SPEC, START, END, board));
    expect(out.mileageEffective).toBe(1_100);
    expect(out.board!.complete).toBe(true);
  });
});

// ─── H. calendar walk ────────────────────────────────────

describe('settleClaim — calendar walk (pure arithmetic)', () => {
  it('H1. crosses the ISO-year boundary: 2026-W53 → 2027-W01', () => {
    const out = settleClaim({
      breakdown: [disabled('2026-W53', 4), active('2027-W01', 4)],
      mileage: 0,
      kmGuaranteed: 2_160,
      ratePerKmEffective: 0.5,
      dateStart: '2026-12-28',
      dateEnd: '2027-01-10',
      board: [],
    });
    expect(out.board!.weeks.map((w) => [w.isoWeek, w.mode, w.daysRequired])).toEqual([
      ['2026-W53', 'off', 0],
      ['2027-W01', 'active', 7],
    ]);
    expect(out.board!.missingDates).toEqual(isoDays('2027-01-04', '2027-01-10'));
  });

  it('H2. 2026-W01 starts in December 2025: its December days are classified by W01', () => {
    const result = calc('2025-12-29', '2026-01-11', { '2026-W01': OFF, '2026-W02': ON });
    const board = [
      { date: '2025-12-29', state: 'drove' as const, km: 5_000 }, // off week — not charged
      ...fill('2026-01-05', '2026-01-11', { '2026-01-05': 700 }),
    ];
    const out = settleClaim(inputFrom(result, '2025-12-29', '2026-01-11', board));
    expect(out.board!.weeks.map((w) => [w.isoWeek, w.mode, w.km, w.daysRequired])).toEqual([
      ['2026-W01', 'off', 0, 0],
      ['2026-W02', 'active', 700, 7],
    ]);
    expect(out.mileageEffective).toBe(700);
  });

  it('H3. includes the leap day (2028-W09 = 28.02–05.03)', () => {
    const out = settleClaim({
      breakdown: [disabled('2028-W08', 0), active('2028-W09', 5)],
      mileage: 0,
      kmGuaranteed: 2_700,
      ratePerKmEffective: 0.5,
      dateStart: '2028-02-26',
      dateEnd: '2028-03-05',
      board: [],
    });
    expect(out.board!.weeks[1]!.missingDates).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
      '2028-03-02',
      '2028-03-03',
      '2028-03-04',
      '2028-03-05',
    ]);
  });

  it('H4. a week of the period with no breakdown row is treated as active', () => {
    const out = settleClaim({
      breakdown: [disabled('2026-W24', 5)],
      mileage: 0,
      kmGuaranteed: 0,
      ratePerKmEffective: 0.5,
      dateStart: '2026-06-13',
      dateEnd: '2026-06-15',
      board: [{ date: '2026-06-15', state: 'drove', km: 300 }],
    });
    expect(out.board!.weeks[1]).toMatchObject({
      isoWeek: '2026-W25',
      mode: 'active',
      km: 300,
      daysRequired: 1,
    });
  });

  it('H5. an invalid period yields no weeks (and never throws)', () => {
    const out = settleClaim({
      breakdown: [disabled('2026-W24', 5)],
      mileage: 0,
      kmGuaranteed: 0,
      ratePerKmEffective: 0.5,
      dateStart: '2026-02-30',
      dateEnd: '2026-03-02',
      board: [],
    });
    expect(out.board).toEqual({ weeks: [], missingDates: [], complete: true });
  });
});

// ─── I. day counters keep their meaning ──────────────────

describe('settleClaim — daysActive / daysTotal / hasDisabledWeeks', () => {
  it('I1. "Saturday only": weekdays not active, the Saturday active, hint raised', () => {
    const sat = disabled('2026-W24', 5, {
      kmPerSaturday: 270,
      saturdaysCounted: 1,
      saturdayDays: ['2026-06-13'],
    });
    const out = settleClaim({
      breakdown: [sat, active('2026-W25', 5)],
      mileage: 3_000,
      kmGuaranteed: 2_970,
      ratePerKmEffective: 0.5,
      dateStart: '2026-06-08',
      dateEnd: '2026-06-21',
      board: [],
    });
    expect(out.daysTotal).toBe(11);
    expect(out.daysActive).toBe(6);
    expect(isWeekActive(sat)).toBe(true);
    expect(out.hasDisabledWeeks).toBe(true);
  });

  it('I2. a disabled week that contributed no counted days still raises the hint', () => {
    const out = settleClaim({
      breakdown: [active('2026-W24', 5), disabled('2026-W25', 0)],
      mileage: 2_000,
      kmGuaranteed: 2_700,
      ratePerKmEffective: 0.5,
      dateStart: '2026-06-08',
      dateEnd: '2026-06-14',
      board: [],
    });
    expect(out.daysActive).toBe(5);
    expect(out.daysTotal).toBe(5);
    expect(out.hasDisabledWeeks).toBe(true);
    expect(out.mileageSource).toBe('board');
  });

  it('I3. fractional working days round to 2 dp', () => {
    const out = settleClaim({
      breakdown: [active('2026-W24', 4.58), disabled('2026-W25', 5.25)],
      mileage: 3_000,
      kmGuaranteed: 2_473,
      ratePerKmEffective: 0.5,
      dateStart: '2026-06-08',
      dateEnd: '2026-06-19',
      board: [],
    });
    expect(out.daysActive).toBe(4.58);
    expect(out.daysTotal).toBe(9.83);
  });
});

describe('settlementNeedsBoard / settlementWeekMode / isWeekActive', () => {
  it('classifies weeks by their limits', () => {
    expect(settlementWeekMode({ kmPerDay: 540, kmPerSaturday: 0 })).toBe('active');
    expect(settlementWeekMode({ kmPerDay: 0, kmPerSaturday: 270 })).toBe('saturdaysOnly');
    expect(settlementWeekMode({ kmPerDay: 0, kmPerSaturday: 0 })).toBe('off');
    // Non-finite limits collapse to 0 — not a guarantee.
    expect(settlementWeekMode({ kmPerDay: Number.NaN, kmPerSaturday: 0 })).toBe('off');
    expect(isWeekActive({ kmPerDay: 0, kmPerSaturday: 0 })).toBe(false);
    expect(isWeekActive({ kmPerDay: 0, kmPerSaturday: 1 })).toBe(true);
  });

  it('needs the board as soon as one week has kmPerDay = 0', () => {
    expect(settlementNeedsBoard([])).toBe(false);
    expect(settlementNeedsBoard([active('2026-W24', 5)])).toBe(false);
    expect(
      settlementNeedsBoard([active('2026-W24', 5), disabled('2026-W25', 5)]),
    ).toBe(true);
    expect(
      settlementNeedsBoard([disabled('2026-W25', 0, { kmPerSaturday: 270 })]),
    ).toBe(true);
  });
});

// ─── J. limits snapshot + engine pin ─────────────────────

describe('limitsSnapshotFromBreakdown', () => {
  it('rebuilds a `YYYY-Www → WeekLimit` map; a deliberate zero survives', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [
        { isoWeek: '2026-W24', kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
        { isoWeek: '2026-W25', kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
      ],
    });
    expect(snapshot).toEqual({
      '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
      '2026-W25': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
  });

  it('round-trips: re-pricing from the snapshot reproduces the original breakdown', () => {
    const live: Record<string, WeekLimit> = {
      '2026-W52': { kmPerDay: 600, ratePerKm: 0.55, kmPerSaturday: 300 },
      '2026-W53': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 250 },
      // 2027-W01 unconfigured ⇒ fallback, frozen into the snapshot as numbers.
    };
    const original = calc('2026-12-21', '2027-01-08', live, { timeFrom: '09:00', timeTo: '17:00' });
    const snapshot = limitsSnapshotFromBreakdown(original);
    expect(Object.keys(snapshot)).toEqual(['2026-W52', '2026-W53', '2027-W01']);

    // Even with a different fallback, the snapshot pins every week of the period.
    const repriced = calcKmGwarant({
      dateStart: '2026-12-21',
      dateEnd: '2027-01-08',
      timeFrom: '09:00',
      timeTo: '17:00',
      limits: snapshot,
      fallback: { kmPerDay: 1, ratePerKm: 9 },
    });
    expect(repriced).toEqual(original);
  });

  it('ignores the envelope-level keys (mileageSource, counters, …)', () => {
    const envelope = {
      mileageSource: 'board' as const,
      mileageEffective: 2_000,
      daysActive: 14,
      breakdown: [{ isoWeek: '2026-W24', kmPerDay: 540, ratePerKm: 0.5 }],
    };
    expect(limitsSnapshotFromBreakdown(envelope)).toEqual({
      '2026-W24': { kmPerDay: 540, ratePerKm: 0.5 },
    });
  });

  it('omits a non-finite `kmPerSaturday` (the engine folds it to the Saturday fallback)', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [{ isoWeek: '2026-W24', kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: null }],
    });
    expect(snapshot['2026-W24']).toEqual({ kmPerDay: 540, ratePerKm: 0.5 });
    expect('kmPerSaturday' in snapshot['2026-W24']!).toBe(false);
  });

  it('returns {} for null / missing / malformed envelopes', () => {
    expect(limitsSnapshotFromBreakdown(null)).toEqual({});
    expect(limitsSnapshotFromBreakdown(undefined)).toEqual({});
    expect(limitsSnapshotFromBreakdown({})).toEqual({});
    expect(limitsSnapshotFromBreakdown({ breakdown: null })).toEqual({});
  });

  it('rejects rows without a valid week key (incl. monthly rows) or with non-numeric limits', () => {
    const snapshot = limitsSnapshotFromBreakdown({
      breakdown: [
        { yearMonth: '2026-06', kmPerDay: 540, ratePerKm: 0.5 } as never, // monthly row
        { kmPerDay: 540, ratePerKm: 0.5 }, // no key at all
        { isoWeek: '2026-W5', kmPerDay: 540, ratePerKm: 0.5 }, // one-digit week
        { isoWeek: '2027-W53', kmPerDay: 540, ratePerKm: 0.5 }, // 2027 has 52 weeks
        { isoWeek: '2026-06', kmPerDay: 540, ratePerKm: 0.5 },
        { isoWeek: '2026-W24', kmPerDay: null, ratePerKm: 0.5 },
        { isoWeek: '2026-W25', kmPerDay: 540, ratePerKm: 'x' },
        null as never,
        { isoWeek: '2026-W26', kmPerDay: 540, ratePerKm: 0.5 },
      ],
    });
    expect(Object.keys(snapshot)).toEqual(['2026-W26']);
  });
});

describe('engine pin — FALLBACK_KM_PER_SATURDAY must stay 0', () => {
  // `resolveKmPerSaturday` in the engine treats a week value of `0` as "not
  // set" and falls through to the global fallback. As long as that fallback is
  // 0 the behaviour is indistinguishable from "switched off" — but the day
  // someone gives it a positive default, EVERY week that explicitly disabled
  // its Saturday silently switches it back on. These two fixtures lock the
  // semantics; `FALLBACK_KM_PER_SATURDAY` in km-calc.ts carries the warning.
  const BASE = {
    // 13.06.2026 is the Saturday of W24.
    dateStart: '2026-06-08',
    dateEnd: '2026-06-14',
    limits: {
      '2026-W24': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    } as Record<string, WeekLimit>,
  };

  it('explicit `kmPerSaturday: 0` + fallback 0 ⇒ the Saturday stays excluded', () => {
    const res = calcKmGwarant({ ...BASE, fallback: FALLBACK_WEEK_LIMIT });
    expect(res.breakdown[0]!.saturdaysCounted).toBe(0);
    expect(res.breakdown[0]!.kmPerSaturday).toBe(0);
  });

  it('REGRESSION TRIPWIRE: a positive fallback would re-enable a disabled Saturday', () => {
    const res = calcKmGwarant({
      ...BASE,
      // Simulates someone changing FALLBACK_KM_PER_SATURDAY to 270.
      fallback: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 },
    });
    // This is NOT desired behaviour — it is the failure mode the pin prevents.
    // If this expectation ever needs changing, the engine's fall-through was
    // fixed and the fallback may finally be made configurable.
    expect(res.breakdown[0]!.saturdaysCounted).toBe(1);
    expect(res.breakdown[0]!.kmPerSaturday).toBe(270);
  });
});
