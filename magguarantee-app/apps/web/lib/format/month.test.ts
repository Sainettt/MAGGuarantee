// Unit tests for the monthly km-calendar helpers (docs/14-design-system.md
// §7.7.6). Every function is pure and string-only — no clock is faked. The
// interesting edges are month length (31 / 30 / leap-Feb 2024 / non-leap-Feb
// 2026), `addMonths` across BOTH year boundaries, and the paging-bound
// predicates AT and AWAY from their bounds.

import { describe, expect, it } from 'vitest';

import {
  addMonths,
  canNext,
  canPrev,
  daysInMonth,
  endOfMonthIso,
  monthDays,
  monthKey,
  startOfMonthIso,
} from './month';

describe('monthKey', () => {
  it('slices YYYY-MM from a YYYY-MM-DD', () => {
    expect(monthKey('2026-06-25')).toBe('2026-06');
  });

  it('passes a bare YYYY-MM through', () => {
    expect(monthKey('2026-06')).toBe('2026-06');
  });
});

describe('startOfMonthIso', () => {
  it('anchors any day to the 1st', () => {
    expect(startOfMonthIso('2026-06-25')).toBe('2026-06-01');
    expect(startOfMonthIso('2026-06-01')).toBe('2026-06-01');
  });
});

describe('daysInMonth / endOfMonthIso', () => {
  it('31-day month (July)', () => {
    expect(daysInMonth('2026-07-15')).toBe(31);
    expect(endOfMonthIso('2026-07-15')).toBe('2026-07-31');
  });

  it('30-day month (June)', () => {
    expect(daysInMonth('2026-06-10')).toBe(30);
    expect(endOfMonthIso('2026-06-10')).toBe('2026-06-30');
  });

  it('leap February (2024) → 29 days', () => {
    expect(daysInMonth('2024-02-01')).toBe(29);
    expect(endOfMonthIso('2024-02-01')).toBe('2024-02-29');
  });

  it('non-leap February (2026) → 28 days', () => {
    expect(daysInMonth('2026-02-15')).toBe(28);
    expect(endOfMonthIso('2026-02-15')).toBe('2026-02-28');
  });

  it('December → 31 days (year-boundary month)', () => {
    expect(daysInMonth('2026-12-09')).toBe(31);
    expect(endOfMonthIso('2026-12-09')).toBe('2026-12-31');
  });
});

describe('addMonths', () => {
  it('returns the 1st of the resulting month (drops day-of-month)', () => {
    expect(addMonths('2026-06-25', 1)).toBe('2026-07-01');
  });

  it('forward across the year boundary', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-11-01', 3)).toBe('2027-02-01');
  });

  it('backward across the year boundary', () => {
    expect(addMonths('2026-01-10', -1)).toBe('2025-12-01');
    expect(addMonths('2026-02-01', -3)).toBe('2025-11-01');
  });

  it('zero offset stays in the same month (anchored to the 1st)', () => {
    expect(addMonths('2026-06-25', 0)).toBe('2026-06-01');
  });

  it('large multi-year offsets, both directions', () => {
    expect(addMonths('2026-06-01', 24)).toBe('2028-06-01');
    expect(addMonths('2026-06-01', -24)).toBe('2024-06-01');
    expect(addMonths('2026-06-01', -18)).toBe('2024-12-01');
  });

  it('no "Jan 31 + 1 month" overflow — lands on Feb, not Mar', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
  });
});

describe('monthDays', () => {
  it('length matches daysInMonth (30-day June)', () => {
    const days = monthDays('2026-06-10');
    expect(days).toHaveLength(30);
  });

  it('first is the 1st, last is the last day', () => {
    const days = monthDays('2026-06-10');
    expect(days[0]).toBe('2026-06-01');
    expect(days[days.length - 1]).toBe('2026-06-30');
  });

  it('leap-Feb (2024) yields 29 ordered days', () => {
    const days = monthDays('2024-02-20');
    expect(days).toHaveLength(29);
    expect(days[0]).toBe('2024-02-01');
    expect(days[28]).toBe('2024-02-29');
  });

  it('non-leap-Feb (2026) yields 28 days', () => {
    const days = monthDays('2026-02-01');
    expect(days).toHaveLength(28);
    expect(days[27]).toBe('2026-02-28');
  });

  it('days are strictly increasing and zero-padded', () => {
    const days = monthDays('2026-06-01');
    expect(days[8]).toBe('2026-06-09');
    expect(days.every((d, i) => i === 0 || d > days[i - 1]!)).toBe(true);
  });
});

describe('canPrev', () => {
  it('true away from the lower bound (current month > createdAt month)', () => {
    expect(canPrev('2026-06', '2026-01')).toBe(true);
  });

  it('false AT the lower bound (current month == createdAt month)', () => {
    expect(canPrev('2026-01', '2026-01')).toBe(false);
  });

  it('false below the lower bound (defensive — clamp already guarantees ≥)', () => {
    expect(canPrev('2025-12', '2026-01')).toBe(false);
  });

  it('true across a year boundary', () => {
    expect(canPrev('2027-01', '2026-12')).toBe(true);
  });
});

describe('canNext', () => {
  it('true away from the upper bound (current month < today month)', () => {
    expect(canNext('2026-01', '2026-06')).toBe(true);
  });

  it('false AT the upper bound (current month == today month)', () => {
    expect(canNext('2026-06', '2026-06')).toBe(false);
  });

  it('false above the upper bound (defensive)', () => {
    expect(canNext('2026-07', '2026-06')).toBe(false);
  });

  it('true across a year boundary', () => {
    expect(canNext('2026-12', '2027-01')).toBe(true);
  });
});
