// How the breakdown reads switched-off months and a board-settled period
// (docs/14 §16.5).

import { describe, expect, it } from 'vitest';
import type {
  ClaimBoardSettlement,
  KmCalcBreakdown,
  MonthBreakdownDto,
  SettlementBoardMonthDto,
} from '@magguarantee/shared';

import {
  analyzeBreakdown,
  boardCell,
  boardColumnTotalKm,
  boardMonthIndex,
  formatBoardDate,
  isBoardIncomplete,
  isBoardSettled,
  isGhostRate,
  isMissingDatesCollapsible,
  isMonthGuaranteeDisabled,
  isMonthSaturdayOnly,
  isMonthWeekdayGuaranteeOff,
  missesLastDay,
  sortMissingDates,
  visibleMissingDates,
} from './breakdownGuarantee';

function month(patch: Partial<MonthBreakdownDto> = {}): MonthBreakdownDto {
  return {
    yearMonth: '2026-02',
    workingDays: 18,
    kmPerDay: 540,
    ratePerKm: 0.5,
    saturdaysCounted: 0,
    kmPerSaturday: 0,
    kmFromSaturdays: 0,
    kmInMonth: 9720,
    saturdayDays: [],
    excludedDays: [],
    ...patch,
  };
}

function envelope(
  rows: MonthBreakdownDto[],
  patch: Partial<KmCalcBreakdown> = {},
): KmCalcBreakdown {
  return {
    totalDays: rows.reduce(
      (acc, r) => acc + r.workingDays + r.saturdaysCounted,
      0,
    ),
    rawTotalDays: 0,
    kmGuaranteed: rows.reduce((acc, r) => acc + r.kmInMonth, 0),
    ratePerKmEffective: 0.5,
    breakdown: rows,
    firstDay: null,
    lastDay: null,
    daysActive: 0,
    daysTotal: 0,
    ...patch,
  } as KmCalcBreakdown;
}

function boardMonth(
  patch: Partial<SettlementBoardMonthDto> = {},
): SettlementBoardMonthDto {
  return {
    yearMonth: '2025-09',
    mode: 'active',
    km: 2000,
    daysFilled: 14,
    daysRequired: 14,
    missingDates: [],
    ...patch,
  };
}

function board(
  months: SettlementBoardMonthDto[],
  patch: Partial<ClaimBoardSettlement> = {},
): ClaimBoardSettlement {
  const missingDates = months.flatMap((m) => m.missingDates);
  return {
    mileageEffective: months.reduce((acc, m) => acc + m.km, 0),
    kmDifference: 0,
    paymentEur: 0,
    months,
    missingDates,
    complete: missingDates.length === 0,
    ...patch,
  };
}

const activeMonth = month({ yearMonth: '2026-03', workingDays: 11 });
const offMonth = month({
  yearMonth: '2026-02',
  workingDays: 7,
  kmPerDay: 0,
  kmPerSaturday: 0,
  kmInMonth: 0,
});
const saturdaysOnlyMonth = month({
  yearMonth: '2026-04',
  workingDays: 20,
  kmPerDay: 0,
  kmPerSaturday: 300,
  saturdaysCounted: 2,
  kmFromSaturdays: 600,
  kmInMonth: 600,
});

describe('month flags', () => {
  it('disabled = weekdays off AND Saturdays off', () => {
    expect(isMonthGuaranteeDisabled(offMonth)).toBe(true);
    expect(isMonthGuaranteeDisabled(month())).toBe(false);
    expect(isMonthGuaranteeDisabled(saturdaysOnlyMonth)).toBe(false);
  });

  it('saturdayOnly = weekdays off but Saturdays credited', () => {
    expect(isMonthSaturdayOnly(saturdaysOnlyMonth)).toBe(true);
    expect(isMonthSaturdayOnly(month())).toBe(false);
    expect(isMonthSaturdayOnly(month({ kmPerDay: 0, kmInMonth: 0 }))).toBe(
      false,
    );
  });

  it('weekday guarantee off covers both the off and the Saturdays-only month', () => {
    expect(isMonthWeekdayGuaranteeOff(offMonth)).toBe(true);
    expect(isMonthWeekdayGuaranteeOff(saturdaysOnlyMonth)).toBe(true);
    expect(isMonthWeekdayGuaranteeOff(activeMonth)).toBe(false);
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
  it('MIXED period = the server flag: notice on, counted off months', () => {
    const info = analyzeBreakdown(
      envelope([offMonth, activeMonth], { mileageSource: 'board' }),
    );
    expect(info.boardSettled).toBe(true);
    expect(info.showMixedNotice).toBe(true);
    expect(info.allDisabled).toBe(false);
    expect(info.offMonthCount).toBe(1);
  });

  it('a Saturdays-only month switches the period onto the board and counts', () => {
    const info = analyzeBreakdown(
      envelope([saturdaysOnlyMonth, activeMonth], { mileageSource: 'board' }),
    );
    expect(info.showMixedNotice).toBe(true);
    // Never 0 — the notice's plural must have a month to talk about.
    expect(info.offMonthCount).toBe(1);
  });

  it('an OLD proportional wniosek (mixed rows, no mileageSource) gets no notice', () => {
    // Legacy envelopes really do arrive without the new keys — the client
    // does not re-parse responses, so nothing backfills `mileageSource`.
    const legacy = {
      totalDays: 18,
      rawTotalDays: 18,
      kmGuaranteed: 5940,
      ratePerKmEffective: 0.5,
      breakdown: [offMonth, activeMonth],
      firstDay: null,
      lastDay: null,
    } as unknown as KmCalcBreakdown;
    const info = analyzeBreakdown(legacy);
    expect(info.boardSettled).toBe(false);
    expect(info.showMixedNotice).toBe(false);
    // The month is still recognised as off (badges / muting stay).
    expect(info.offMonthCount).toBe(1);
  });

  it("'declared' never shows the notice, even with mixed rows", () => {
    const info = analyzeBreakdown(
      envelope([offMonth, activeMonth], { mileageSource: 'declared' }),
    );
    expect(info.showMixedNotice).toBe(false);
  });

  it('flags a period that is off end-to-end (empty state, no notice)', () => {
    const info = analyzeBreakdown(
      envelope([offMonth], { mileageSource: 'board' }),
    );
    expect(info.allDisabled).toBe(true);
    expect(info.showMixedNotice).toBe(false);
  });

  it('an ordinary period triggers nothing', () => {
    const info = analyzeBreakdown(
      envelope([activeMonth], { mileageSource: 'declared' }),
    );
    expect(info.allDisabled).toBe(false);
    expect(info.boardSettled).toBe(false);
    expect(info.showMixedNotice).toBe(false);
    expect(info.offMonthCount).toBe(0);
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
    expect(isBoardIncomplete(board([boardMonth()]))).toBe(false);
    expect(
      isBoardIncomplete(
        board([
          boardMonth({ daysFilled: 13, missingDates: ['2025-09-18'] }),
        ]),
      ),
    ).toBe(true);
    // Defensive: incomplete with an empty list still blocks.
    expect(
      isBoardIncomplete(board([boardMonth()], { complete: false })),
    ).toBe(true);
  });
});

describe('boardColumnTotalKm', () => {
  it('totals the LIVE board — the same source as the column rows', () => {
    // Repro 2026-09: submitted while a September day had no row (priced on
    // 4950), the weryfikator filled it later — the board now says 5450.
    const live = board([
      boardMonth({ yearMonth: '2026-08', mode: 'off', km: 0, daysFilled: 0, daysRequired: 0 }),
      boardMonth({ yearMonth: '2026-09', km: 5450, daysFilled: 18, daysRequired: 18 }),
    ]);
    const stale = envelope([offMonth, activeMonth], {
      mileageSource: 'board',
      mileageEffective: 4950,
    });
    const total = boardColumnTotalKm(live);
    expect(total).toBe(5450);
    expect(total).toBe(live.months.reduce((acc, m) => acc + m.km, 0));
    // Never the km the breakdown was last priced on.
    expect(total).not.toBe(stale.mileageEffective);
  });

  it('no board ⇒ null (the cell renders «—»)', () => {
    expect(boardColumnTotalKm(null)).toBeNull();
    expect(boardColumnTotalKm(undefined)).toBeNull();
  });
});

describe('boardMonthIndex + boardCell', () => {
  const settlement = board([
    boardMonth({ yearMonth: '2025-08', mode: 'off', km: 0, daysFilled: 0, daysRequired: 0 }),
    boardMonth({ yearMonth: '2025-09', daysFilled: 13, missingDates: ['2025-09-18'] }),
    boardMonth({ yearMonth: '2025-10', mode: 'saturdaysOnly', km: 700, daysFilled: 2, daysRequired: 2 }),
  ]);
  const index = boardMonthIndex(settlement);

  it('joins by yearMonth', () => {
    expect(index.get('2025-09')?.km).toBe(2000);
    expect(index.get('2025-11')).toBeUndefined();
    expect(boardMonthIndex(null).size).toBe(0);
  });

  it('an off month is «—» with the off title', () => {
    expect(boardCell(index.get('2025-08'))).toEqual({ kind: 'off' });
  });

  it('a month without a board pair is a plain «—»', () => {
    expect(boardCell(index.get('2025-11'))).toEqual({ kind: 'none' });
  });

  it('nothing required ⇒ plain «—»', () => {
    expect(
      boardCell(boardMonth({ mode: 'saturdaysOnly', daysRequired: 0, daysFilled: 0, km: 0 })),
    ).toEqual({ kind: 'none' });
  });

  it('an incomplete active month carries the missing count', () => {
    expect(boardCell(index.get('2025-09'))).toEqual({
      kind: 'value',
      km: 2000,
      daysFilled: 13,
      daysRequired: 14,
      saturdaysOnly: false,
      missing: 1,
    });
  });

  it('a Saturdays-only month is labelled as Saturdays', () => {
    expect(boardCell(index.get('2025-10'))).toMatchObject({
      kind: 'value',
      km: 700,
      saturdaysOnly: true,
      missing: 0,
    });
  });

  it('the missing count never goes negative', () => {
    expect(
      boardCell(boardMonth({ daysFilled: 15, daysRequired: 14 })),
    ).toMatchObject({ missing: 0 });
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
