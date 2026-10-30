// Three-state weekly limit semantics — the `0` must never be swallowed, NULL
// must never read as empty.

import { describe, expect, it } from 'vitest';
import {
  FALLBACK_KM_PER_DAY,
  FALLBACK_RATE_PER_KM,
  type WeeklyLimitDto,
} from '@magguarantee/shared';

import {
  describeLimit,
  effectiveKmPerDay,
  effectiveKmPerSaturday,
  formatKmValue,
  formatLimitInput,
  formatRateValue,
  guaranteeState,
  isGuaranteeChecked,
  isWeekDisabled,
  isWeekSaturdayOnly,
  isWeekUnconfigured,
  maxWeeklyKm,
  parseLimitInput,
  unconfiguredWeeks,
  weekValues,
} from './limitState';

function row(
  isoWeek: number,
  kmPerDay: number | null,
  kmPerSaturday: number | null = null,
  ratePerKm: number | null = 0.5,
  isoYear = 2026,
): WeeklyLimitDto {
  return {
    id: `00000000-0000-4000-8000-${String(isoWeek).padStart(12, '0')}`,
    isoYear,
    isoWeek,
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
  it('renders null as an empty buffer, values (0 included) as text', () => {
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

describe('week-level state', () => {
  it('a missing row is all NULL', () => {
    expect(weekValues(null)).toEqual({
      kmPerDay: null,
      ratePerKm: null,
      kmPerSaturday: null,
    });
  });

  it('a week is muted only when weekdays AND the Saturday pay nothing', () => {
    expect(isWeekDisabled(weekValues(row(1, 0, 0)))).toBe(true);
    expect(isWeekDisabled(weekValues(row(1, 0, null)))).toBe(true);
    expect(isWeekDisabled(weekValues(row(1, 0, 300)))).toBe(false);
    expect(isWeekDisabled(weekValues(row(1, 540, 0)))).toBe(false);
    // NULL km/day pays the 540 fallback — never muted.
    expect(isWeekDisabled(weekValues(null))).toBe(false);
    expect(isWeekDisabled(weekValues(row(1, null, 0)))).toBe(false);
  });

  it('"Saturday only" is weekdays off + the Saturday paying', () => {
    expect(isWeekSaturdayOnly(weekValues(row(1, 0, 300)))).toBe(true);
    expect(isWeekSaturdayOnly(weekValues(row(1, 0, 0)))).toBe(false);
    expect(isWeekSaturdayOnly(weekValues(row(1, 540, 300)))).toBe(false);
  });

  it('unconfigured = NULL km/day OR NULL rate; the Saturday never counts', () => {
    expect(isWeekUnconfigured(weekValues(null))).toBe(true);
    expect(isWeekUnconfigured(weekValues(row(1, null, 300, 0.5)))).toBe(true);
    expect(isWeekUnconfigured(weekValues(row(1, 540, 300, null)))).toBe(true);
    expect(isWeekUnconfigured(weekValues(row(1, 0, null, 0.5)))).toBe(false);
    expect(isWeekUnconfigured(weekValues(row(1, 540, null, 0)))).toBe(false);
  });
});

describe('unconfiguredWeeks', () => {
  it('counts every week of a 53-week year when nothing is stored', () => {
    expect(unconfiguredWeeks(2026, [])).toHaveLength(53);
    expect(unconfiguredWeeks(2026, undefined)).toHaveLength(53);
    expect(unconfiguredWeeks(2027, [])).toHaveLength(52);
  });

  it('lists missing rows and NULL km/day or rate — but NOT zeroes', () => {
    const rows = [
      row(1, 0, 0), // off — configured!
      row(2, 540), // configured
      row(3, null, null, 0.52), // km/day NULL
      row(4, 540, 300, null), // rate NULL
    ];
    const weeks = unconfiguredWeeks(2026, rows);
    expect(weeks).not.toContain(1);
    expect(weeks).not.toContain(2);
    expect(weeks).toContain(3);
    expect(weeks).toContain(4);
    expect(weeks).toHaveLength(51);
  });

  it('ignores rows of another ISO year', () => {
    expect(unconfiguredWeeks(2026, [row(5, 540, 0, 0.5, 2025)])).toContain(5);
  });
});

describe('describeLimit — NULL is never empty', () => {
  it('km/day: NULL ⇒ default 540, 0 ⇒ off, n ⇒ value', () => {
    expect(describeLimit('kmPerDay', null)).toEqual({
      kind: 'default',
      value: FALLBACK_KM_PER_DAY,
    });
    expect(describeLimit('kmPerDay', 0)).toEqual({ kind: 'off' });
    expect(describeLimit('kmPerDay', 600)).toEqual({ kind: 'value', value: 600 });
  });

  it('rate: NULL ⇒ default 0,50; 0 stays a price (no "off" state)', () => {
    expect(describeLimit('ratePerKm', null)).toEqual({
      kind: 'default',
      value: FALLBACK_RATE_PER_KM,
    });
    expect(describeLimit('ratePerKm', 0)).toEqual({ kind: 'value', value: 0 });
  });

  it('Saturday: NULL and 0 both read «—»', () => {
    expect(describeLimit('kmPerSaturday', null)).toEqual({ kind: 'none' });
    expect(describeLimit('kmPerSaturday', 0)).toEqual({ kind: 'none' });
    expect(describeLimit('kmPerSaturday', 300)).toEqual({
      kind: 'value',
      value: 300,
    });
  });
});

describe('weekly maximum (typo check)', () => {
  it('NULL km/day uses the fallback, 0 stays 0; NULL Saturday is 0', () => {
    expect(effectiveKmPerDay(null)).toBe(540);
    expect(effectiveKmPerDay(0)).toBe(0);
    expect(effectiveKmPerSaturday(null)).toBe(0);
    expect(maxWeeklyKm(540, 300)).toBe(3000);
    expect(maxWeeklyKm(5400, 0)).toBe(27000);
  });
});

describe('pl-PL number formats', () => {
  it('rate has 2–4 decimals with a comma', () => {
    expect(formatRateValue(0.5)).toBe('0,50');
    expect(formatRateValue(0.5125)).toBe('0,5125');
    expect(formatRateValue(0)).toBe('0,00');
  });

  it('km keep up to 2 decimals and no trailing zeros', () => {
    expect(formatKmValue(540)).toBe('540');
    expect(formatKmValue(540.5)).toBe('540,5');
  });
});
