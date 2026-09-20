// How the breakdown reads switched-off months (§16.5).

import { describe, expect, it } from 'vitest';
import type { KmCalcBreakdown, MonthBreakdownDto } from '@magguarantee/shared';

import {
  analyzeBreakdown,
  isGhostRate,
  isMonthGuaranteeDisabled,
  isMonthSaturdayOnly,
  monthCountedDays,
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

describe('month flags', () => {
  it('disabled = weekdays off AND Saturdays off', () => {
    expect(
      isMonthGuaranteeDisabled(
        month({ kmPerDay: 0, kmPerSaturday: 0, kmInMonth: 0 }),
      ),
    ).toBe(true);
    expect(isMonthGuaranteeDisabled(month())).toBe(false);
    expect(
      isMonthGuaranteeDisabled(
        month({ kmPerDay: 0, kmPerSaturday: 300, kmFromSaturdays: 600 }),
      ),
    ).toBe(false);
  });

  it('saturdayOnly = weekdays off but Saturdays credited', () => {
    expect(
      isMonthSaturdayOnly(
        month({
          kmPerDay: 0,
          kmPerSaturday: 300,
          saturdaysCounted: 2,
          kmFromSaturdays: 600,
          kmInMonth: 600,
        }),
      ),
    ).toBe(true);
    expect(isMonthSaturdayOnly(month())).toBe(false);
    expect(
      isMonthSaturdayOnly(month({ kmPerDay: 0, kmInMonth: 0 })),
    ).toBe(false);
  });

  it('counted days = weekdays + qualifying Saturdays', () => {
    expect(monthCountedDays(month({ workingDays: 7, saturdaysCounted: 2 }))).toBe(
      9,
    );
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
  const activeMonth = month({ yearMonth: '2026-03', workingDays: 11 });
  const offMonth = month({
    yearMonth: '2026-02',
    workingDays: 7,
    kmPerDay: 0,
    kmPerSaturday: 0,
    kmInMonth: 0,
  });

  it('flags a MIXED period and lists the off months with their days', () => {
    const info = analyzeBreakdown(
      envelope([offMonth, activeMonth], {
        daysActive: 11,
        daysTotal: 18,
        mileageEffective: 5500,
      }),
      9000,
    );
    expect(info.showGapNotice).toBe(true);
    expect(info.allDisabled).toBe(false);
    expect(info.disabledMonths).toEqual([{ yearMonth: '2026-02', days: 7 }]);
    expect(info.daysActive).toBe(11);
    expect(info.daysTotal).toBe(18);
    expect(info.mileageEffective).toBe(5500);
    expect(info.mileage).toBe(9000);
  });

  it('flags a period that is off end-to-end (no notice, empty state)', () => {
    const info = analyzeBreakdown(envelope([offMonth]), 9000);
    expect(info.allDisabled).toBe(true);
    expect(info.showGapNotice).toBe(false);
  });

  it('an ordinary period triggers neither', () => {
    const info = analyzeBreakdown(envelope([activeMonth]), 9000);
    expect(info.allDisabled).toBe(false);
    expect(info.showGapNotice).toBe(false);
    expect(info.disabledCount).toBe(0);
  });

  it('an empty breakdown is not "all disabled"', () => {
    expect(analyzeBreakdown(envelope([]), 0).allDisabled).toBe(false);
  });

  it('LEGACY wniosek: mileageEffective falls back to the claim mileage', () => {
    // Legacy envelopes really do arrive without the new keys — the client
    // does not re-parse responses, so the Zod backfill never runs.
    const legacy = {
      totalDays: 18,
      rawTotalDays: 18,
      kmGuaranteed: 9720,
      ratePerKmEffective: 0.5,
      breakdown: [activeMonth],
      firstDay: null,
      lastDay: null,
    } as unknown as KmCalcBreakdown;
    const info = analyzeBreakdown(legacy, 9000);
    expect(info.mileageEffective).toBe(9000);
    expect(info.mileage).toBe(9000);
    expect(info.daysActive).toBe(18);
    expect(info.daysTotal).toBe(18);
  });

  it('zero mileage stays zero (no falsy fallback)', () => {
    const info = analyzeBreakdown(
      envelope([activeMonth], { mileageEffective: 0 }),
      0,
    );
    expect(info.mileageEffective).toBe(0);
    expect(info.mileage).toBe(0);
  });
});
