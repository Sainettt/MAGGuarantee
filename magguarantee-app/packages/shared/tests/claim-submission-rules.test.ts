// Tests for the carrier-side submission gates.
//
// Three rules, three describe-blocks. Boundaries (`9.99` vs `10.00`,
// `144h-1s` vs `144h` vs `144h+1s`, span 9 vs 10, same-day, inverted) are
// the whole point — they're the failure modes the carrier hits in practice.

import { describe, expect, it } from 'vitest';

import {
  DEFAULTS,
  canSubmitByDuration,
  checkClaimDates,
  cooldownCheck,
  formatDaysPl,
  formatHoursPl,
  nextAllowedSubmitAt,
  roundDays,
} from '../src/domain/claim-submission-rules';

// ─── roundDays ───────────────────────────────────────────────

describe('roundDays', () => {
  it('returns 0 for 0 hours', () => {
    expect(roundDays(0)).toBe(0);
  });

  it('rounds 0.012 hours down to 0.00 (one ten-thousandth of a day)', () => {
    expect(roundDays(0.012)).toBe(0);
  });

  it('rounds 107.1 hours to 4.46 days (spec example)', () => {
    expect(roundDays(107.1)).toBe(4.46);
  });

  it('rounds 216 hours to exactly 9 (no fractional part)', () => {
    expect(roundDays(216)).toBe(9);
  });

  it('rounds 239.76 hours to 9.99 (just-below-threshold case)', () => {
    expect(roundDays(239.76)).toBe(9.99);
  });

  it('rounds 240 hours to exactly 10 (threshold-boundary case)', () => {
    expect(roundDays(240)).toBe(10);
  });

  it('clamps negative input to 0 (defensive, undefined behavior in spec)', () => {
    expect(roundDays(-5)).toBe(0);
  });

  it('clamps NaN to 0', () => {
    expect(roundDays(Number.NaN)).toBe(0);
  });
});

// ─── formatDaysPl ────────────────────────────────────────────

describe('formatDaysPl', () => {
  it('formats 4.46 with comma decimal sep', () => {
    expect(formatDaysPl(4.46)).toBe('4,46');
  });

  it('formats 0 with two fractional digits', () => {
    expect(formatDaysPl(0)).toBe('0,00');
  });

  it('formats 10 with two fractional digits', () => {
    expect(formatDaysPl(10)).toBe('10,00');
  });

  it('clamps non-finite to 0,00', () => {
    expect(formatDaysPl(Number.NaN)).toBe('0,00');
  });
});

// ─── formatHoursPl ───────────────────────────────────────────

describe('formatHoursPl', () => {
  it('formats 10 days → 240,00 h', () => {
    expect(formatHoursPl(10)).toBe('240,00 h');
  });

  it('formats 8.87 days → 212,88 h (real carrier-form value)', () => {
    expect(formatHoursPl(8.87)).toBe('212,88 h');
  });

  it('formats 0 days → 0,00 h', () => {
    expect(formatHoursPl(0)).toBe('0,00 h');
  });

  it('clamps non-finite to 0,00 h (defensive, live-preview path)', () => {
    expect(formatHoursPl(Number.NaN)).toBe('0,00 h');
  });

  it('clamps negative to 0,00 h', () => {
    expect(formatHoursPl(-3)).toBe('0,00 h');
  });
});

// ─── canSubmitByDuration ─────────────────────────────────────

const DURATION_BASE = {
  workedDaysThreshold: DEFAULTS.workedDaysThreshold, // 10
};

describe('canSubmitByDuration', () => {
  it('rejects 0 worked days', () => {
    const r = canSubmitByDuration({ totalDays: 0, ...DURATION_BASE });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('duration_insufficient');
      expect(r.message).toContain('10,00'); // threshold formatted
      expect(r.message).toContain('0,00'); // current rounded value
      expect(r.message).toContain('co najmniej');
    }
  });

  it('rejects 8.87 worked days (real-world example from carrier UI)', () => {
    const r = canSubmitByDuration({ totalDays: 8.87, ...DURATION_BASE });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('8,87');
  });

  // Boundary parametrization — the whole point of this rule lives in three
  // numbers (just below, exactly at, just above). Future threshold flips are
  // a single edit to `DEFAULTS.workedDaysThreshold` plus this `it.each` table.
  it.each<[number, boolean]>([
    [9.99, false], // just below — rejects
    [10.0, true],  // exactly at — passes (boundary inclusive)
    [10.01, true], // just above — passes
  ])('boundary: totalDays=%s → ok=%s', (totalDays, expected) => {
    const r = canSubmitByDuration({ totalDays, ...DURATION_BASE });
    expect(r.ok).toBe(expected);
  });

  it('rejects 9.99 — boundary is inclusive on the upper side only', () => {
    // Spelled out separately so a regression in the message wording for the
    // most common boundary-failure surfaces as its own assertion.
    const r = canSubmitByDuration({ totalDays: 9.99, ...DURATION_BASE });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('9,99');
      expect(r.message).toContain('10,00');
    }
  });

  it('accepts 11 worked days (comfortable margin)', () => {
    const r = canSubmitByDuration({ totalDays: 11, ...DURATION_BASE });
    expect(r.ok).toBe(true);
  });

  it('clamps NaN to 0 and rejects', () => {
    const r = canSubmitByDuration({ totalDays: Number.NaN, ...DURATION_BASE });
    expect(r.ok).toBe(false);
  });

  it('clamps negative totalDays to 0 and rejects', () => {
    const r = canSubmitByDuration({ totalDays: -3, ...DURATION_BASE });
    expect(r.ok).toBe(false);
  });

  it('honors a custom threshold (5) — 5.00 days passes (boundary inclusive)', () => {
    const r = canSubmitByDuration({ totalDays: 5, workedDaysThreshold: 5 });
    expect(r.ok).toBe(true);
  });

  it('honors a custom threshold (5) — 4.99 days rejects', () => {
    const r = canSubmitByDuration({ totalDays: 4.99, workedDaysThreshold: 5 });
    expect(r.ok).toBe(false);
  });
});

// ─── cooldownCheck + nextAllowedSubmitAt ─────────────────────

const LAST = new Date('2026-05-10T12:00:00Z');
const COOLDOWN_6_HOURS = 6 * 24; // 144

describe('cooldownCheck — 6-day default', () => {
  it('allows a first claim (lastCreatedAt = null)', () => {
    const r = cooldownCheck({
      now: new Date('2026-05-12T00:00:00Z'),
      lastCreatedAt: null,
      cooldownDays: 6,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects at 144h - 1s (just before boundary)', () => {
    const now = new Date(LAST.getTime() + COOLDOWN_6_HOURS * 60 * 60 * 1000 - 1000);
    const r = cooldownCheck({ now, lastCreatedAt: LAST, cooldownDays: 6 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('vehicle_cooldown');
      expect(r.nextAllowedAt.getTime()).toBe(
        LAST.getTime() + COOLDOWN_6_HOURS * 60 * 60 * 1000,
      );
      expect(r.message).toContain('Nastepny wniosek');
    }
  });

  it('allows at exactly 144h (boundary inclusive)', () => {
    const now = new Date(LAST.getTime() + COOLDOWN_6_HOURS * 60 * 60 * 1000);
    const r = cooldownCheck({ now, lastCreatedAt: LAST, cooldownDays: 6 });
    expect(r.ok).toBe(true);
  });

  it('allows at 144h + 1s (just past boundary)', () => {
    const now = new Date(LAST.getTime() + COOLDOWN_6_HOURS * 60 * 60 * 1000 + 1000);
    const r = cooldownCheck({ now, lastCreatedAt: LAST, cooldownDays: 6 });
    expect(r.ok).toBe(true);
  });

  it('rejects at 100h with nextAllowedAt = lastCreatedAt + 144h', () => {
    const now = new Date(LAST.getTime() + 100 * 60 * 60 * 1000);
    const r = cooldownCheck({ now, lastCreatedAt: LAST, cooldownDays: 6 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.nextAllowedAt.toISOString()).toBe(
        new Date(LAST.getTime() + COOLDOWN_6_HOURS * 60 * 60 * 1000).toISOString(),
      );
    }
  });
});

describe('cooldownCheck — custom + degenerate values', () => {
  it('always allows when cooldownDays is 0', () => {
    const r = cooldownCheck({
      now: new Date(LAST.getTime() + 60 * 1000), // 1 minute later
      lastCreatedAt: LAST,
      cooldownDays: 0,
    });
    expect(r.ok).toBe(true);
  });

  it('clamps negative cooldown to 0 (always allows)', () => {
    const r = cooldownCheck({
      now: LAST,
      lastCreatedAt: LAST,
      cooldownDays: -3,
    });
    expect(r.ok).toBe(true);
  });

  it('formats nextAllowedAt in Europe/Warsaw locale', () => {
    // 144h after 2026-05-10T12:00:00Z = 2026-05-16T12:00:00Z = 14:00 Warsaw (CEST).
    const now = new Date(LAST.getTime() + 1000); // very early in cooldown
    const r = cooldownCheck({ now, lastCreatedAt: LAST, cooldownDays: 6 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe('Nastepny wniosek na ten pojazd mozna zlozyc od 16.05.2026, 14:00');
    }
  });
});

describe('nextAllowedSubmitAt', () => {
  it('adds 144h for cooldownDays=6', () => {
    const t = nextAllowedSubmitAt(LAST, 6);
    expect(t.getTime() - LAST.getTime()).toBe(COOLDOWN_6_HOURS * 60 * 60 * 1000);
  });

  it('returns the same instant when cooldownDays is 0', () => {
    const t = nextAllowedSubmitAt(LAST, 0);
    expect(t.getTime()).toBe(LAST.getTime());
  });

  it('clamps negative cooldownDays to 0', () => {
    const t = nextAllowedSubmitAt(LAST, -2);
    expect(t.getTime()).toBe(LAST.getTime());
  });
});

// ─── checkClaimDates ─────────────────────────────────────────
//
// Boundary-driven: exactly-today, exactly 90-day span, exactly 7-day
// deadline, inverted order, and the half-filled / malformed inputs that
// caused Bug 1 (premature date-order error). "today" is always injected.

const TODAY = '2026-06-05'; // matches the project's current date

function codes(
  out: ReturnType<typeof checkClaimDates>,
): string[] {
  return out.map((v) => v.code);
}

describe('checkClaimDates — empty / malformed inputs (Bug 1 guard)', () => {
  it('returns no violations when both dates empty', () => {
    expect(checkClaimDates({ dateStart: '', dateEnd: '', today: TODAY })).toEqual(
      [],
    );
  });

  it('returns no violations when only dateStart is filled (Bug 1 core case)', () => {
    // Picking a start date against the empty-string dateEnd default must NOT
    // produce a date_order violation.
    const out = checkClaimDates({
      dateStart: '2026-06-01',
      dateEnd: '',
      today: TODAY,
    });
    expect(out).toEqual([]);
  });

  it('returns no violations when only dateEnd is filled', () => {
    expect(
      checkClaimDates({ dateStart: '', dateEnd: '2026-06-01', today: TODAY }),
    ).toEqual([]);
  });

  it('treats a malformed dateEnd as not-yet-present (no order error)', () => {
    expect(
      checkClaimDates({ dateStart: '2026-06-01', dateEnd: '2026-13-40', today: TODAY }),
    ).toEqual([]);
  });

  it('treats a malformed today as absent — span still checked, future skipped', () => {
    const out = checkClaimDates({
      dateStart: '2026-01-01',
      dateEnd: '2026-06-01',
      today: 'not-a-date',
    });
    // span 152 days > 90 → period_too_long; future checks skipped (no today).
    expect(codes(out)).toEqual(['period_too_long']);
  });
});

describe('checkClaimDates — date order', () => {
  it('flags date_order when start > end and attaches no params', () => {
    const out = checkClaimDates({
      dateStart: '2026-06-04',
      dateEnd: '2026-06-01',
      today: TODAY,
    });
    expect(codes(out)).toContain('date_order');
    const v = out.find((x) => x.code === 'date_order')!;
    expect(v.key).toBe('violationDateOrder');
    expect(v.params).toEqual({});
  });

  it('allows start === end (single-day period, boundary inclusive)', () => {
    const out = checkClaimDates({
      dateStart: '2026-06-01',
      dateEnd: '2026-06-01',
      today: TODAY,
    });
    expect(out).toEqual([]);
  });

  it('skips span/deadline while order is broken (only reports date_order + future)', () => {
    // start in the future AND inverted — order + start_future, but no span.
    const out = checkClaimDates({
      dateStart: '2026-07-01',
      dateEnd: '2026-06-01',
      today: TODAY,
    });
    expect(codes(out)).toEqual(['date_order', 'date_start_future']);
  });
});

describe('checkClaimDates — future', () => {
  it('flags end in the future with the date param', () => {
    const out = checkClaimDates({
      dateStart: '2026-06-01',
      dateEnd: '2026-06-10',
      today: TODAY,
    });
    const v = out.find((x) => x.code === 'date_end_future')!;
    expect(v.key).toBe('violationDateEndInFuture');
    expect(v.params).toEqual({ date: '2026-06-10' });
  });

  it('allows end exactly on today (boundary inclusive)', () => {
    const out = checkClaimDates({
      dateStart: '2026-06-01',
      dateEnd: TODAY,
      today: TODAY,
    });
    expect(out).toEqual([]);
  });

  it('allows start exactly on today', () => {
    const out = checkClaimDates({
      dateStart: TODAY,
      dateEnd: TODAY,
      today: TODAY,
    });
    expect(out).toEqual([]);
  });

  it('flags both start and end in the future', () => {
    const out = checkClaimDates({
      dateStart: '2026-06-06',
      dateEnd: '2026-06-07',
      today: TODAY,
    });
    expect(codes(out)).toEqual(
      expect.arrayContaining(['date_end_future', 'date_start_future']),
    );
  });
});

describe('checkClaimDates — period span (default 90, inclusive)', () => {
  it('allows a span of exactly 90 days (boundary inclusive)', () => {
    // 2026-03-08 .. 2026-06-05 inclusive = 90 days.
    const out = checkClaimDates({
      dateStart: '2026-03-08',
      dateEnd: '2026-06-05',
      today: TODAY,
    });
    expect(codes(out)).not.toContain('period_too_long');
  });

  it('flags a span of 91 days with maxDays + periodDays params', () => {
    // 2026-03-07 .. 2026-06-05 inclusive = 91 days.
    const out = checkClaimDates({
      dateStart: '2026-03-07',
      dateEnd: '2026-06-05',
      today: TODAY,
    });
    const v = out.find((x) => x.code === 'period_too_long')!;
    expect(v.key).toBe('violationPeriodTooLong');
    expect(v.params).toEqual({ maxDays: 90, periodDays: 91 });
  });

  it('honors a caller-injected maxPeriodDays', () => {
    const out = checkClaimDates({
      dateStart: '2026-06-01',
      dateEnd: '2026-06-05',
      today: TODAY,
      maxPeriodDays: 3,
    });
    const v = out.find((x) => x.code === 'period_too_long')!;
    expect(v.params).toEqual({ maxDays: 3, periodDays: 5 });
  });
});

describe('checkClaimDates — deadline (default 7 days after unload)', () => {
  it('allows end exactly 7 days before today (boundary inclusive)', () => {
    // 2026-05-29 is 7 days before 2026-06-05 → still allowed.
    const out = checkClaimDates({
      dateStart: '2026-05-20',
      dateEnd: '2026-05-29',
      today: TODAY,
    });
    expect(codes(out)).not.toContain('deadline_passed');
  });

  it('flags end 8 days before today with maxDays + elapsed params', () => {
    // 2026-05-28 is 8 days before 2026-06-05 → deadline passed.
    const out = checkClaimDates({
      dateStart: '2026-05-20',
      dateEnd: '2026-05-28',
      today: TODAY,
    });
    const v = out.find((x) => x.code === 'deadline_passed')!;
    expect(v.key).toBe('violationDeadline');
    expect(v.params).toEqual({ maxDays: 7, elapsed: 8 });
  });

  it('honors a caller-injected maxDaysAfterUnload', () => {
    const out = checkClaimDates({
      dateStart: '2026-06-01',
      dateEnd: '2026-06-01',
      today: TODAY,
      maxDaysAfterUnload: 2,
    });
    const v = out.find((x) => x.code === 'deadline_passed')!;
    expect(v.params).toEqual({ maxDays: 2, elapsed: 4 });
  });
});

describe('checkClaimDates — combined ordering', () => {
  it('reports order → future in display order', () => {
    const out = checkClaimDates({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-07',
      today: TODAY,
    });
    expect(codes(out)).toEqual(['date_order', 'date_end_future', 'date_start_future']);
  });
});

// ─── DEFAULTS sanity ─────────────────────────────────────────

describe('DEFAULTS', () => {
  it('matches the AppConfig seeded values', () => {
    expect(DEFAULTS).toEqual({
      workedDaysThreshold: 10,
      vehicleCooldownDays: 6,
      maxPeriodDays: 90,
      maxDaysAfterUnload: 7,
    });
  });
});
