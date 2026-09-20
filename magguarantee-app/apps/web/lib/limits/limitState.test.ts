// Three-state limit semantics — the `0` must never be swallowed.

import { describe, expect, it } from 'vitest';

import {
  countUnconfiguredMonths,
  formatLimitInput,
  guaranteeState,
  isGuaranteeChecked,
  isMonthDisabled,
  isMonthSaturdayOnly,
  parseLimitInput,
} from './limitState';

function row(
  month: number,
  kmPerDay: number | null,
  kmPerSaturday: number | null = null,
  ratePerKm: number | null = 0.5,
) {
  return {
    id: `id-${month}`,
    year: 2026,
    month,
    kmPerDay,
    ratePerKm,
    kmPerSaturday,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('parseLimitInput — three distinct outcomes', () => {
  it('empty string is EMPTY, not "no change" and not 0', () => {
    expect(parseLimitInput('')).toEqual({ kind: 'empty' });
    expect(parseLimitInput('   ')).toEqual({ kind: 'empty' });
  });

  it('"0" is a VALUE (guarantee off), never invalid', () => {
    expect(parseLimitInput('0')).toEqual({ kind: 'value', value: 0 });
    expect(parseLimitInput(' 0 ')).toEqual({ kind: 'value', value: 0 });
    expect(parseLimitInput('0,00')).toEqual({ kind: 'value', value: 0 });
  });

  it('accepts the PL comma decimal separator', () => {
    expect(parseLimitInput('0,52')).toEqual({ kind: 'value', value: 0.52 });
    expect(parseLimitInput('540')).toEqual({ kind: 'value', value: 540 });
  });

  it('rejects negatives and garbage', () => {
    expect(parseLimitInput('-1')).toEqual({ kind: 'invalid' });
    expect(parseLimitInput('abc')).toEqual({ kind: 'invalid' });
    expect(parseLimitInput('12abc')).toEqual({ kind: 'invalid' });
  });
});

describe('formatLimitInput', () => {
  it('renders null and 0 as an empty buffer, values as text', () => {
    expect(formatLimitInput(null)).toBe('');
    expect(formatLimitInput(undefined)).toBe('');
    expect(formatLimitInput(0)).toBe('0');
    expect(formatLimitInput(540)).toBe('540');
  });
});

describe('guaranteeState', () => {
  it('null ⇒ default (fallback applies), 0 ⇒ disabled, >0 ⇒ active', () => {
    expect(guaranteeState(null)).toBe('default');
    expect(guaranteeState(undefined)).toBe('default');
    expect(guaranteeState(0)).toBe('disabled');
    expect(guaranteeState(540)).toBe('active');
  });

  it('the checkbox answers "does the guarantee apply" — NULL is CHECKED', () => {
    expect(isGuaranteeChecked(null)).toBe(true);
    expect(isGuaranteeChecked(540)).toBe(true);
    expect(isGuaranteeChecked(0)).toBe(false);
  });
});

describe('row-level month state', () => {
  it('a month is disabled only when weekdays AND Saturdays are off', () => {
    expect(isMonthDisabled(row(1, 0, 0))).toBe(true);
    expect(isMonthDisabled(row(1, 0, null))).toBe(true);
    expect(isMonthDisabled(row(1, 0, 300))).toBe(false);
    expect(isMonthDisabled(row(1, 540, 0))).toBe(false);
    expect(isMonthDisabled(null)).toBe(false);
  });

  it('"Saturdays only" is weekdays off + Saturdays paying', () => {
    expect(isMonthSaturdayOnly(row(1, 0, 300))).toBe(true);
    expect(isMonthSaturdayOnly(row(1, 0, 0))).toBe(false);
    expect(isMonthSaturdayOnly(row(1, 540, 300))).toBe(false);
  });
});

describe('countUnconfiguredMonths', () => {
  it('counts missing rows and NULL kmPerDay — but NOT zeroes', () => {
    expect(countUnconfiguredMonths([])).toBe(12);
    expect(countUnconfiguredMonths(undefined)).toBe(12);
    // Jan = off (configured!), Feb = value, Mar = rate only (kmPerDay NULL).
    const rows = [row(1, 0, 0), row(2, 540), row(3, null, null, 0.52)];
    expect(countUnconfiguredMonths(rows)).toBe(10);
  });
});
