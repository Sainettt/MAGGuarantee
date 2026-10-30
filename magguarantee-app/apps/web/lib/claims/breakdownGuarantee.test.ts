// How the breakdown reads switched-off weeks, a week's Saturday and a
// board-settled period (docs/14 §16.5, §18.7).

import { describe, expect, it } from 'vitest';
import type {
  ClaimBoardSettlement,
  KmCalcBreakdown,
  SettlementBoardWeekDto,
  WeekBreakdownDto,
} from '@magguarantee/shared';

import {
  analyzeBreakdown,
  boardCell,
  boardColumnTotalKm,
  boardWeekIndex,
  formatBoardDate,
  isBoardIncomplete,
  isBoardSettled,
  isGhostRate,
  isMissingDatesCollapsible,
  isWeekGuaranteeDisabled,
  isWeekSaturdayOnly,
  isWeekdayGuaranteeOff,
  missesLastDay,
  saturdayCell,
  sortMissingDates,
  visibleMissingDates,
  weekGuaranteeMode,
} from './breakdownGuarantee';

/** A full active ISO week, 2026-W24 (08.06–14.06): 5 days × 540. */
function week(patch: Partial<WeekBreakdownDto> = {}): WeekBreakdownDto {
  return {
    isoWeek: '2026-W24',
    weekStart: '2026-06-08',
    weekEnd: '2026-06-14',
    periodStart: '2026-06-08',
    periodEnd: '2026-06-14',
    workingDays: 5,
    kmPerDay: 540,
    ratePerKm: 0.5,
    saturdaysCounted: 0,
    kmPerSaturday: 0,
    kmFromSaturdays: 0,
    saturdayDays: [],
    kmInWeek: 2700,
    excludedDays: [],
    ...patch,
  };
}

function envelope(
  rows: WeekBreakdownDto[],
  patch: Partial<KmCalcBreakdown> = {},
): KmCalcBreakdown {
  return {
    totalDays: rows.reduce(
      (acc, r) => acc + r.workingDays + r.saturdaysCounted,
      0,
    ),
    rawTotalDays: 0,
    kmGuaranteed: rows.reduce((acc, r) => acc + r.kmInWeek, 0),
    ratePerKmEffective: 0.5,
    breakdown: rows,
    firstDay: null,
    lastDay: null,
    daysActive: 0,
    daysTotal: 0,
    ...patch,
  } as KmCalcBreakdown;
}

function boardWeek(
  patch: Partial<SettlementBoardWeekDto> = {},
): SettlementBoardWeekDto {
  return {
    isoWeek: '2026-W24',
    mode: 'active',
    km: 2000,
    daysFilled: 7,
    daysRequired: 7,
    missingDates: [],
    ...patch,
  };
}

function board(
  weeks: SettlementBoardWeekDto[],
  patch: Partial<ClaimBoardSettlement> = {},
): ClaimBoardSettlement {
  const missingDates = weeks.flatMap((w) => w.missingDates);
  return {
    mileageEffective: weeks.reduce((acc, w) => acc + w.km, 0),
    kmDifference: 0,
    paymentEur: 0,
    weeks,
    missingDates,
    complete: missingDates.length === 0,
    ...patch,
  };
}

const activeWeek = week({ isoWeek: '2026-W26', weekStart: '2026-06-22', weekEnd: '2026-06-28' });
const offWeek = week({
  isoWeek: '2026-W25',
  weekStart: '2026-06-15',
  weekEnd: '2026-06-21',
  kmPerDay: 0,
  kmPerSaturday: 0,
  kmInWeek: 0,
});
/** «Tylko sobota» whose Saturday WAS credited (300 km). */
const saturdayOnlyWeek = week({
  isoWeek: '2026-W27',
  weekStart: '2026-06-29',
  weekEnd: '2026-07-05',
  kmPerDay: 0,
  kmPerSaturday: 300,
  saturdaysCounted: 1,
  kmFromSaturdays: 300,
  saturdayDays: ['2026-07-04'],
  kmInWeek: 300,
});
/** «Tylko sobota» whose Saturday lies outside the period — still that mode. */
const saturdayOnlyUncredited = week({
  kmPerDay: 0,
  kmPerSaturday: 300,
  periodEnd: '2026-06-12',
  kmInWeek: 0,
});

describe('week flags', () => {
  it('disabled = weekdays off AND no Saturday guarantee', () => {
    expect(isWeekGuaranteeDisabled(offWeek)).toBe(true);
    expect(isWeekGuaranteeDisabled(week())).toBe(false);
    expect(isWeekGuaranteeDisabled(saturdayOnlyWeek)).toBe(false);
  });

  it('saturdayOnly keys on the LIMIT, credited or not', () => {
    expect(isWeekSaturdayOnly(saturdayOnlyWeek)).toBe(true);
    expect(isWeekSaturdayOnly(saturdayOnlyUncredited)).toBe(true);
    expect(isWeekSaturdayOnly(week())).toBe(false);
    expect(isWeekSaturdayOnly(offWeek)).toBe(false);
    // An active week with a Saturday guarantee is just active.
    expect(isWeekSaturdayOnly(week({ kmPerSaturday: 300 }))).toBe(false);
  });

  it('weekday guarantee off covers both the off and the Saturday-only week', () => {
    expect(isWeekdayGuaranteeOff(offWeek)).toBe(true);
    expect(isWeekdayGuaranteeOff(saturdayOnlyWeek)).toBe(true);
    expect(isWeekdayGuaranteeOff(activeWeek)).toBe(false);
  });

  it('weekGuaranteeMode picks exactly one marking', () => {
    expect(weekGuaranteeMode(offWeek)).toBe('disabled');
    expect(weekGuaranteeMode(saturdayOnlyWeek)).toBe('saturdayOnly');
    expect(weekGuaranteeMode(saturdayOnlyUncredited)).toBe('saturdayOnly');
    expect(weekGuaranteeMode(week({ kmPerSaturday: 300 }))).toBe('active');
  });
});

describe('saturdayCell («Sob.»)', () => {
  it('counted — the credited km', () => {
    expect(saturdayCell(saturdayOnlyWeek)).toEqual({ status: 'counted', km: 300 });
    expect(
      saturdayCell(
        week({ kmPerSaturday: 250, saturdaysCounted: 1, kmFromSaturdays: 250 }),
      ),
    ).toEqual({ status: 'counted', km: 250 });
  });

  it('notCounted — guaranteed Saturday outside the period / on a ban day', () => {
    expect(saturdayCell(saturdayOnlyUncredited)).toEqual({
      status: 'notCounted',
      km: 0,
    });
  });

  it('none — the week has no Saturday guarantee', () => {
    expect(saturdayCell(week())).toEqual({ status: 'none', km: 0 });
    expect(saturdayCell(offWeek)).toEqual({ status: 'none', km: 0 });
  });
});

describe('ghost rate', () => {
  it('hides the rate whenever nothing is guaranteed', () => {
    expect(isGhostRate(0)).toBe(true);
    expect(isGhostRate(9000)).toBe(false);
    // Missing at runtime on a half-built preview.
    expect(isGhostRate(undefined)).toBe(true);
  });
});

describe('analyzeBreakdown', () => {
  it('MIXED period = the server flag: notice on, counted off weeks', () => {
    const info = analyzeBreakdown(
      envelope([offWeek, activeWeek], { mileageSource: 'board' }),
    );
    expect(info.boardSettled).toBe(true);
    expect(info.showMixedNotice).toBe(true);
    expect(info.allDisabled).toBe(false);
    expect(info.offWeekCount).toBe(1);
  });

  it('a Saturday-only week switches the period onto the board and counts', () => {
    const info = analyzeBreakdown(
      envelope([offWeek, saturdayOnlyWeek, activeWeek], { mileageSource: 'board' }),
    );
    expect(info.showMixedNotice).toBe(true);
    // Never 0 — the notice's plural must have a week to talk about.
    expect(info.offWeekCount).toBe(2);
  });

  it('absent mileageSource means declared — no notice, rows still marked', () => {
    // The client does not re-parse responses, so nothing backfills the flag.
    const unflagged = {
      totalDays: 10,
      rawTotalDays: 10,
      kmGuaranteed: 2700,
      ratePerKmEffective: 0.5,
      breakdown: [offWeek, activeWeek],
      firstDay: null,
      lastDay: null,
    } as unknown as KmCalcBreakdown;
    const info = analyzeBreakdown(unflagged);
    expect(info.boardSettled).toBe(false);
    expect(info.showMixedNotice).toBe(false);
    expect(info.offWeekCount).toBe(1);
  });

  it("'declared' never shows the notice, even with mixed rows", () => {
    const info = analyzeBreakdown(
      envelope([offWeek, activeWeek], { mileageSource: 'declared' }),
    );
    expect(info.showMixedNotice).toBe(false);
  });

  it('flags a period that is off end-to-end (empty state, no notice)', () => {
    const info = analyzeBreakdown(
      envelope([offWeek, week({ ...offWeek, isoWeek: '2026-W26' })], {
        mileageSource: 'board',
      }),
    );
    expect(info.allDisabled).toBe(true);
    expect(info.showMixedNotice).toBe(false);
  });

  it('a Saturday-only week is not «all disabled» — it pays', () => {
    const info = analyzeBreakdown(
      envelope([offWeek, saturdayOnlyWeek], { mileageSource: 'board' }),
    );
    expect(info.allDisabled).toBe(false);
  });

  it('an ordinary period triggers nothing', () => {
    const info = analyzeBreakdown(
      envelope([activeWeek], { mileageSource: 'declared' }),
    );
    expect(info.allDisabled).toBe(false);
    expect(info.boardSettled).toBe(false);
    expect(info.showMixedNotice).toBe(false);
    expect(info.offWeekCount).toBe(0);
  });

  it('an empty breakdown is not "all disabled"', () => {
    expect(analyzeBreakdown(envelope([])).allDisabled).toBe(false);
  });
});

describe('isBoardSettled', () => {
  it('reads only the server flag; absent means declared', () => {
    expect(isBoardSettled({ mileageSource: 'board' })).toBe(true);
    expect(isBoardSettled({ mileageSource: 'declared' })).toBe(false);
    expect(isBoardSettled({})).toBe(false);
    expect(isBoardSettled(null)).toBe(false);
    expect(isBoardSettled(undefined)).toBe(false);
  });
});

describe('isBoardIncomplete', () => {
  it('only an explicit complete === false blocks', () => {
    expect(isBoardIncomplete(null)).toBe(false);
    expect(isBoardIncomplete(undefined)).toBe(false);
    expect(isBoardIncomplete(board([boardWeek()]))).toBe(false);
    expect(
      isBoardIncomplete(
        board([boardWeek({ daysFilled: 6, missingDates: ['2026-06-12'] })]),
      ),
    ).toBe(true);
    // Defensive: incomplete with an empty list still blocks.
    expect(isBoardIncomplete(board([boardWeek()], { complete: false }))).toBe(true);
  });
});

describe('boardColumnTotalKm', () => {
  it('totals the LIVE board — the same source as the column rows', () => {
    // Submitted while a day had no row (priced on 4950), the weryfikator
    // filled it later — the board now says 5450.
    const live = board([
      boardWeek({ isoWeek: '2026-W25', mode: 'off', km: 0, daysFilled: 0, daysRequired: 0 }),
      boardWeek({ isoWeek: '2026-W26', km: 5450 }),
    ]);
    const stale = envelope([offWeek, activeWeek], {
      mileageSource: 'board',
      mileageEffective: 4950,
    });
    const total = boardColumnTotalKm(live);
    expect(total).toBe(5450);
    expect(total).toBe(live.weeks.reduce((acc, w) => acc + w.km, 0));
    // Never the km the breakdown was last priced on.
    expect(total).not.toBe(stale.mileageEffective);
  });

  it('no board ⇒ null (the cell renders «—»)', () => {
    expect(boardColumnTotalKm(null)).toBeNull();
    expect(boardColumnTotalKm(undefined)).toBeNull();
  });
});

describe('boardWeekIndex + boardCell', () => {
  const settlement = board([
    boardWeek({ isoWeek: '2026-W25', mode: 'off', km: 0, daysFilled: 0, daysRequired: 0 }),
    boardWeek({ isoWeek: '2026-W26', daysFilled: 6, missingDates: ['2026-06-26'] }),
    boardWeek({ isoWeek: '2026-W27', mode: 'saturdaysOnly', km: 350, daysFilled: 1, daysRequired: 1 }),
  ]);
  const index = boardWeekIndex(settlement);

  it('joins by isoWeek', () => {
    expect(index.get('2026-W26')?.km).toBe(2000);
    expect(index.get('2026-W28')).toBeUndefined();
    expect(boardWeekIndex(null).size).toBe(0);
  });

  it('an off week is «—» with the off title', () => {
    expect(boardCell(index.get('2026-W25'))).toEqual({ kind: 'off' });
  });

  it('a week without a board pair is a plain «—»', () => {
    expect(boardCell(index.get('2026-W28'))).toEqual({ kind: 'none' });
  });

  it('nothing required ⇒ plain «—»', () => {
    expect(
      boardCell(boardWeek({ mode: 'saturdaysOnly', daysRequired: 0, daysFilled: 0, km: 0 })),
    ).toEqual({ kind: 'none' });
  });

  it('an incomplete active week carries the missing count', () => {
    expect(boardCell(index.get('2026-W26'))).toEqual({
      kind: 'value',
      km: 2000,
      daysFilled: 6,
      daysRequired: 7,
      saturdaysOnly: false,
      missing: 1,
    });
  });

  it('a Saturday-only week is labelled as its Saturday («1 z 1 sob.»)', () => {
    expect(boardCell(index.get('2026-W27'))).toMatchObject({
      kind: 'value',
      km: 350,
      daysFilled: 1,
      daysRequired: 1,
      saturdaysOnly: true,
      missing: 0,
    });
  });

  it('the missing count never goes negative', () => {
    expect(boardCell(boardWeek({ daysFilled: 8, daysRequired: 7 }))).toMatchObject({
      missing: 0,
    });
  });
});

describe('missing-dates list', () => {
  const nine = [
    '2025-09-09',
    '2025-09-01',
    '2025-09-03',
    '2025-09-02',
    '2025-09-05',
    '2025-09-04',
    '2025-09-07',
    '2025-09-06',
    '2025-09-08',
  ];

  it('sorts ascending, including across New Year', () => {
    expect(sortMissingDates(['2026-01-02', '2025-12-31', '2026-01-01'])).toEqual(
      ['2025-12-31', '2026-01-01', '2026-01-02'],
    );
  });

  it('up to 8 dates are always shown in full', () => {
    const eight = sortMissingDates(nine.slice(0, 8));
    expect(isMissingDatesCollapsible(8)).toBe(false);
    expect(visibleMissingDates(eight, false)).toHaveLength(8);
  });

  it('above 8 collapses to 6 until expanded', () => {
    const sorted = sortMissingDates(nine);
    expect(isMissingDatesCollapsible(9)).toBe(true);
    expect(visibleMissingDates(sorted, false)).toEqual(sorted.slice(0, 6));
    expect(visibleMissingDates(sorted, true)).toEqual(sorted);
  });

  it('detects the missing last day of the period from a datetime dateEnd', () => {
    expect(missesLastDay(['2025-09-18'], '2025-09-18T00:00:00.000Z')).toBe(true);
    expect(missesLastDay(['2025-09-17'], '2025-09-18')).toBe(false);
    expect(missesLastDay(['2025-09-18'], null)).toBe(false);
  });

  it('formats as a local calendar day with the year (no UTC drift)', () => {
    const out = formatBoardDate('2025-09-18', 'pl');
    expect(out).toContain('18');
    expect(out).toContain('09');
    expect(out).toContain('2025');
    // Unparseable input is echoed rather than rendered as «Invalid Date».
    expect(formatBoardDate('garbage', 'en')).toBe('garbage');
  });
});
