// Fixture suite for the Guarantee Watchdog live-state function (plan §1/§4).
//
// Per the repo culture (see km-calc.test.ts / polish-calendar.test.ts) there is
// NO real production data — every expected date below was hand-derived against
// the Polish public-holiday calendar and cross-checked with an offline mirror
// of the same working-day engine (script preserved at /tmp/wdref.mjs during
// development). If a fixture diverges from the implementation, fix the
// implementation, not the test — the Polish holiday calendar is canonical.
//
// The deadline math REUSES `addPolishWorkingDays` (anchor day EXCLUDED) and
// `workingDaysBetween` (signed, exclusive-start / inclusive-end) from
// `polish-calendar.ts`; those helpers have their own ≥30-fixture suite, so here
// we focus on the watchdog's *classification* and anchor-selection contract.
//
// Reference calendar facts used below (all Warsaw / Polish holidays):
//   - Boże Ciało 2026-06-04 (Thu, Easter+60) — a MOVABLE Easter-based holiday
//   - Poniedziałek Wielkanocny 2026-04-06 (Mon, Easter+1)
//   - Nowy Rok 2026-01-01, Trzech Króli 2026-01-06
//   - Boże Narodzenie 2025-12-25 / 12-26
//
// Coverage (≥15 fixtures, per plan §4 required list):
//   anchor from zjechał; anchor from agreementSince; both null → inactive;
//   active delegation silences counter; precedence zjechał > agreement;
//   daysLeft=3; daysLeft=1; deadline today (daysLeft=0, still counting);
//   daysLeft=-1 → violated; weekend inside window; public holiday inside window;
//   deadline computed across a holiday; retro-dated zjechał → daysLeft≤1;
//   retro-dated zjechał → already violated; month boundary; year boundary;
//   movable Easter-based holiday (Boże Ciało) inside window; + reminderThreshold.

import { describe, expect, it } from 'vitest';

import {
  computeGuaranteeWatchdog,
  reminderThreshold,
  type GuaranteeWatchdogConfig,
} from '../src/domain/guarantee-watchdog';

/** `YYYY-MM-DD` → local-midnight Date (test-local helper, matches engine). */
function D(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y as number, (m as number) - 1, d as number);
}

/** local-midnight Date → `YYYY-MM-DD` (test-local helper). */
function key(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

/** Production defaults: 10 working days, reminders at D-3 / D-1 (plan §1). */
const CONFIG: GuaranteeWatchdogConfig = {
  deadlineWorkingDays: 10,
  reminderOffsets: [3, 1],
};

// ─── 1. Anchor selection & the two "off" states ──────────

describe('computeGuaranteeWatchdog — anchor selection', () => {
  it('01. anchor from zjechał (lastReturnAt), fresh day → counting, 10 left', () => {
    // anchor 2026-06-01, +10 wd crosses Boże Ciało (06-04) so deadline is
    // pushed one day: plain +10wd from 06-01 = 06-15, +1 for the holiday = 06-16.
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-01'),
      hasActiveDelegation: false,
      lastReturnAt: D('2026-06-01'),
      agreementSince: D('2026-05-01'),
      config: CONFIG,
    });
    expect(r.status).toBe('counting');
    expect(r.anchorSource).toBe('zjechal');
    expect(key(r.anchorAt!)).toBe('2026-06-01');
    expect(key(r.deadlineAt!)).toBe('2026-06-16');
    expect(r.daysLeft).toBe(10);
  });

  it('02. anchor from agreementSince when never departed → source "agreement"', () => {
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-01'),
      hasActiveDelegation: false,
      lastReturnAt: null,
      agreementSince: D('2026-06-01'),
      config: CONFIG,
    });
    expect(r.status).toBe('counting');
    expect(r.anchorSource).toBe('agreement');
    expect(key(r.anchorAt!)).toBe('2026-06-01');
    expect(key(r.deadlineAt!)).toBe('2026-06-16');
    expect(r.daysLeft).toBe(10);
  });

  it('03. zjechał wins over agreementSince (precedence, plan §1 anchor order)', () => {
    // lastReturnAt 2026-06-01 anchors the cycle even though agreementSince is
    // an old 2020 date; today 06-11 → daysLeft 3 off the 06-16 deadline.
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-11'),
      hasActiveDelegation: false,
      lastReturnAt: D('2026-06-01'),
      agreementSince: D('2020-01-01'),
      config: CONFIG,
    });
    expect(r.anchorSource).toBe('zjechal');
    expect(key(r.anchorAt!)).toBe('2026-06-01');
    expect(r.daysLeft).toBe(3);
  });

  it('04. both anchors null → inactive, all fields null (no counter)', () => {
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-01'),
      hasActiveDelegation: false,
      lastReturnAt: null,
      agreementSince: null,
      config: CONFIG,
    });
    expect(r.status).toBe('inactive');
    expect(r.anchorAt).toBeNull();
    expect(r.anchorSource).toBeNull();
    expect(r.deadlineAt).toBeNull();
    expect(r.daysLeft).toBeNull();
  });
});

// ─── 2. Active delegation silences the counter ───────────

describe('computeGuaranteeWatchdog — ok_active', () => {
  it('05. active delegation → ok_active regardless of an old stale anchor', () => {
    // Even with a year-old return AND an even older agreementSince, an active
    // delegation silences the counter; per the contract we null every field.
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-01'),
      hasActiveDelegation: true,
      lastReturnAt: D('2025-01-01'),
      agreementSince: D('2024-01-01'),
      config: CONFIG,
    });
    expect(r.status).toBe('ok_active');
    expect(r.anchorAt).toBeNull();
    expect(r.anchorSource).toBeNull();
    expect(r.deadlineAt).toBeNull();
    expect(r.daysLeft).toBeNull();
  });

  it('06. active delegation wins even with no anchor at all', () => {
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-01'),
      hasActiveDelegation: true,
      lastReturnAt: null,
      agreementSince: null,
      config: CONFIG,
    });
    expect(r.status).toBe('ok_active');
    expect(r.daysLeft).toBeNull();
  });
});

// ─── 3. Deadline-boundary classification ─────────────────

describe('computeGuaranteeWatchdog — counting / violated boundaries', () => {
  // All anchored at 2026-06-01 → deadline 2026-06-16 (crosses Boże Ciało 06-04).
  const base = {
    hasActiveDelegation: false as const,
    lastReturnAt: D('2026-06-01'),
    agreementSince: null,
    config: CONFIG,
  };

  it('07. exactly daysLeft=3 (today 06-11) → counting', () => {
    const r = computeGuaranteeWatchdog({ ...base, today: D('2026-06-11') });
    expect(r.daysLeft).toBe(3);
    expect(r.status).toBe('counting');
  });

  it('08. exactly daysLeft=1 (today 06-15) → counting', () => {
    const r = computeGuaranteeWatchdog({ ...base, today: D('2026-06-15') });
    expect(r.daysLeft).toBe(1);
    expect(r.status).toBe('counting');
  });

  it('09. deadline today (today 06-16) → daysLeft=0, still counting NOT violated', () => {
    const r = computeGuaranteeWatchdog({ ...base, today: D('2026-06-16') });
    expect(r.daysLeft).toBe(0);
    expect(r.status).toBe('counting');
  });

  it('10. one working day past deadline (today 06-17) → daysLeft=-1, violated', () => {
    const r = computeGuaranteeWatchdog({ ...base, today: D('2026-06-17') });
    expect(r.daysLeft).toBe(-1);
    expect(r.status).toBe('violated');
  });
});

// ─── 4. Holidays / weekends inside the window ────────────

describe('computeGuaranteeWatchdog — holidays & weekends in window', () => {
  it('11. movable Easter-based holiday (Boże Ciało 06-04) inside window pushes deadline', () => {
    // agreement-only anchor 2026-05-27 (Wed); +10 wd crossing Boże Ciało (Thu
    // 06-04) lands on 2026-06-11. today 06-01 → 7 working days left.
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-01'),
      hasActiveDelegation: false,
      lastReturnAt: null,
      agreementSince: D('2026-05-27'),
      config: CONFIG,
    });
    expect(key(r.deadlineAt!)).toBe('2026-06-11');
    expect(r.daysLeft).toBe(7);
    expect(r.status).toBe('counting');
  });

  it('12. deadline computed across a movable holiday (Poniedziałek Wielkanocny 04-06)', () => {
    // anchor 2026-03-30 (Mon); the +10-wd window contains Easter Monday
    // (Poniedziałek Wielkanocny 2026-04-06, Easter+1), so a plain +10 wd
    // (exactly 2 calendar weeks = 2026-04-13) is pushed one day to 2026-04-14.
    const r = computeGuaranteeWatchdog({
      today: D('2026-03-30'),
      hasActiveDelegation: false,
      lastReturnAt: D('2026-03-30'),
      agreementSince: null,
      config: CONFIG,
    });
    expect(key(r.deadlineAt!)).toBe('2026-04-14');
    expect(r.daysLeft).toBe(10);
  });

  it('13. weekend inside window still counts by working days (Fri anchor)', () => {
    // anchor 2026-06-05 (Fri); +10 wd (two weekends skipped, Boże Ciało already
    // before the anchor) → 2026-06-19 (Fri). today == anchor → 10 left.
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-05'),
      hasActiveDelegation: false,
      lastReturnAt: D('2026-06-05'),
      agreementSince: null,
      config: CONFIG,
    });
    expect(key(r.deadlineAt!)).toBe('2026-06-19');
    expect(r.daysLeft).toBe(10);
  });
});

// ─── 5. Retro-dated zjechał (weryfikator backfill) ───────

describe('computeGuaranteeWatchdog — retro-dated zjechał', () => {
  it('14. retro zjechał landing at daysLeft=1 (anchor 05-18, today 05-29)', () => {
    // anchor 2026-05-18 (Mon); +10 wd crossing Boże Ciało? No — 06-04 is beyond
    // the window; deadline = 2026-06-01 (Mon). today 05-29 (Fri) → 1 left.
    const r = computeGuaranteeWatchdog({
      today: D('2026-05-29'),
      hasActiveDelegation: false,
      lastReturnAt: D('2026-05-18'),
      agreementSince: null,
      config: CONFIG,
    });
    expect(key(r.deadlineAt!)).toBe('2026-06-01');
    expect(r.daysLeft).toBe(1);
    expect(r.status).toBe('counting');
  });

  it('15. retro zjechał landing already violated (anchor 05-01, today 06-01)', () => {
    // anchor 2026-05-01 (Fri, Święto Pracy — a holiday, but it is only the
    // anchor day which is excluded from counting anyway); +10 wd = 2026-05-15.
    // today 06-01 is well past → deeply negative, violated.
    const r = computeGuaranteeWatchdog({
      today: D('2026-06-01'),
      hasActiveDelegation: false,
      lastReturnAt: D('2026-05-01'),
      agreementSince: D('2026-05-25'),
      config: CONFIG,
    });
    expect(r.anchorSource).toBe('zjechal');
    expect(key(r.deadlineAt!)).toBe('2026-05-15');
    expect(r.daysLeft).toBe(-11);
    expect(r.status).toBe('violated');
  });
});

// ─── 6. Month / year boundaries ──────────────────────────

describe('computeGuaranteeWatchdog — month & year boundaries', () => {
  it('16. month boundary: anchor 2026-01-20, deadline rolls into February', () => {
    const r = computeGuaranteeWatchdog({
      today: D('2026-01-20'),
      hasActiveDelegation: false,
      lastReturnAt: D('2026-01-20'),
      agreementSince: null,
      config: CONFIG,
    });
    expect(key(r.deadlineAt!)).toBe('2026-02-03');
    expect(r.daysLeft).toBe(10);
  });

  it('17. year boundary: anchor 2025-12-22, deadline crosses Nowy Rok + Trzech Króli', () => {
    // +10 wd from 2025-12-22 skips Boże Narodzenie (12-25/26), the weekends,
    // Nowy Rok (01-01) and Trzech Króli (01-06) → 2026-01-09.
    const r = computeGuaranteeWatchdog({
      today: D('2025-12-22'),
      hasActiveDelegation: false,
      lastReturnAt: D('2025-12-22'),
      agreementSince: null,
      config: CONFIG,
    });
    expect(key(r.deadlineAt!)).toBe('2026-01-09');
    expect(r.daysLeft).toBe(10);
  });
});

// ─── 7. reminderThreshold (pure offset→threshold mapping) ─

describe('reminderThreshold — most-urgent due offset', () => {
  const O = [3, 1] as const;

  it('18. comfortably ahead (daysLeft=5) → nothing due (null)', () => {
    expect(reminderThreshold(5, O)).toBeNull();
  });
  it('19. exactly at D-3 (daysLeft=3) → 3', () => {
    expect(reminderThreshold(3, O)).toBe(3);
  });
  it('20. between D-3 and D-1 (daysLeft=2) → 3 (only D-3 reached)', () => {
    expect(reminderThreshold(2, O)).toBe(3);
  });
  it('21. at D-1 (daysLeft=1) → 1 (most urgent reached)', () => {
    expect(reminderThreshold(1, O)).toBe(1);
  });
  it('22. deadline today (daysLeft=0) → 1', () => {
    expect(reminderThreshold(0, O)).toBe(1);
  });
  it('23. past deadline (daysLeft<0) → still the most-urgent offset (1)', () => {
    expect(reminderThreshold(-5, O)).toBe(1);
  });
});
