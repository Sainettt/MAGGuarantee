// Tests for the carrier-side submission gates.
//
// Three rules, three describe-blocks. Boundaries (`9.00` vs `9.01`,
// `144h-1s` vs `144h` vs `144h+1s`, span 9 vs 10, same-day, inverted) are
// the whole point — they're the failure modes the carrier hits in practice.

import { describe, expect, it } from 'vitest';

import {
  DEFAULTS,
  canSubmitByDuration,
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

  it('rounds 216.24 hours to 9.01 (just-above-threshold case)', () => {
    expect(roundDays(216.24)).toBe(9.01);
  });

  it('rounds 240 hours to exactly 10', () => {
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
  workedDaysThreshold: DEFAULTS.workedDaysThreshold, // 9
};

describe('canSubmitByDuration', () => {
  it('rejects 0 worked days', () => {
    const r = canSubmitByDuration({ totalDays: 0, ...DURATION_BASE });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('duration_insufficient');
      expect(r.message).toContain('9,00'); // threshold formatted
      expect(r.message).toContain('0,00'); // current rounded value
    }
  });

  it('rejects exactly 9.00 worked days — NOT strictly > 9', () => {
    const r = canSubmitByDuration({ totalDays: 9, ...DURATION_BASE });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('9,00');
  });

  it('rejects 8.87 worked days (real-world example from carrier UI)', () => {
    const r = canSubmitByDuration({ totalDays: 8.87, ...DURATION_BASE });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('8,87');
  });

  it('accepts 9.01 worked days — just past the threshold', () => {
    const r = canSubmitByDuration({ totalDays: 9.01, ...DURATION_BASE });
    expect(r.ok).toBe(true);
  });

  it('accepts 10 worked days (comfortable margin)', () => {
    const r = canSubmitByDuration({ totalDays: 10, ...DURATION_BASE });
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

  it('honors a custom threshold (5) — 5.01 days passes', () => {
    const r = canSubmitByDuration({ totalDays: 5.01, workedDaysThreshold: 5 });
    expect(r.ok).toBe(true);
  });

  it('honors a custom threshold (5) — 5.00 days rejects', () => {
    const r = canSubmitByDuration({ totalDays: 5, workedDaysThreshold: 5 });
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

// ─── DEFAULTS sanity ─────────────────────────────────────────

describe('DEFAULTS', () => {
  it('matches the AppConfig seeded values', () => {
    expect(DEFAULTS).toEqual({
      workedDaysThreshold: 9,
      vehicleCooldownDays: 6,
    });
  });
});
