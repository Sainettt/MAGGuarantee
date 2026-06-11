// Fixture suite for the Polish working-day calendar (docs/21 §3).
//
// Per the repo culture (see km-calc.test.ts) there is no real production data —
// every expected value below was hand-derived from the Polish public-holiday
// statute and cross-checked against an offline mirror of the algorithm
// (script preserved at /tmp/polref.mjs during development). If a fixture
// diverges from the implementation, fix the implementation, not the test —
// the Polish holiday calendar is the canonical source.
//
// Coverage (≥30 fixtures):
//   - polishHolidays per-year set incl. movable (Wielkanocny / Boże Ciało)
//   - addPolishWorkingDays: anchor excluded, weekend/holiday skips, year roll
//   - workingDaysBetween: signed, exclusive-start / inclusive-end
//   - bucketForAnchor: overdue / dueSoon / onTrack boundaries, exactly-0
//   - deadlines straddling EACH fixed + movable holiday
//   - year-boundary roll incl. Nowy Rok + Trzech Króli

import { describe, expect, it } from 'vitest';

import {
  addPolishWorkingDays,
  bucketForAnchor,
  isPolishWorkingDay,
  polishHolidays,
  workingDaysBetween,
} from '../src/domain/polish-calendar';

/** `YYYY-MM-DD` → local-midnight Date (test-local helper). */
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

// ─── 1. polishHolidays: the set ──────────────────────────

describe('polishHolidays — fixed + movable set', () => {
  it('01. 2026 set is exactly the 11 Polish public holidays (no Good Friday)', () => {
    const got = [...polishHolidays(2026).keys()].sort();
    expect(got).toEqual([
      '2026-01-01', // Nowy Rok
      '2026-01-06', // Trzech Króli
      '2026-04-06', // Poniedziałek Wielkanocny (Easter+1)
      '2026-05-01', // Święto Pracy
      '2026-05-03', // Konstytucji 3 Maja
      '2026-06-04', // Boże Ciało (Easter+60)
      '2026-08-15', // Wniebowzięcie NMP
      '2026-11-01', // Wszystkich Świętych
      '2026-11-11', // Niepodległości
      '2026-12-25', // Boże Narodzenie 1
      '2026-12-26', // Boże Narodzenie 2
    ]);
  });

  it('02. Good Friday (Wielki Piątek) is NOT a Polish holiday — 2026-04-03 absent', () => {
    expect(polishHolidays(2026).has('2026-04-03')).toBe(false);
  });

  it('03. 2025 movable holidays land on Easter+1 / Easter+60', () => {
    const h = polishHolidays(2025);
    expect(h.has('2025-04-21')).toBe(true); // Easter 2025-04-20 → Mon +1
    expect(h.has('2025-06-19')).toBe(true); // Boże Ciało +60
  });

  it('04. 2027 movable holidays shift with the early Easter (2027-03-28)', () => {
    const h = polishHolidays(2027);
    expect(h.has('2027-03-29')).toBe(true); // Wielkanocny
    expect(h.has('2027-05-27')).toBe(true); // Boże Ciało
  });

  it('05. labels are the Polish names', () => {
    expect(polishHolidays(2026).get('2026-05-03')).toBe(
      'Święto Konstytucji 3 Maja',
    );
    expect(polishHolidays(2026).get('2026-06-04')).toBe('Boże Ciało');
  });
});

// ─── 2. isPolishWorkingDay ───────────────────────────────

describe('isPolishWorkingDay', () => {
  it('06. fixed holiday (Święto Pracy) is non-working', () => {
    expect(isPolishWorkingDay(D('2026-05-01'))).toBe(false);
  });
  it('07. movable holiday (Boże Ciało) is non-working', () => {
    expect(isPolishWorkingDay(D('2026-06-04'))).toBe(false);
  });
  it('08. Saturday is non-working', () => {
    expect(isPolishWorkingDay(D('2026-06-06'))).toBe(false);
  });
  it('09. Sunday is non-working', () => {
    expect(isPolishWorkingDay(D('2026-06-07'))).toBe(false);
  });
  it('10. a plain Wednesday is working', () => {
    expect(isPolishWorkingDay(D('2026-06-03'))).toBe(true);
  });
});

// ─── 3. addPolishWorkingDays (anchor excluded) ───────────

describe('addPolishWorkingDays — anchor excluded, forward count', () => {
  it('11. n=0 returns the anchor unchanged (midnight)', () => {
    expect(key(addPolishWorkingDays(D('2026-06-10'), 0))).toBe('2026-06-10');
  });

  it('12. Friday +1 working day skips the weekend → Monday', () => {
    expect(key(addPolishWorkingDays(D('2026-06-05'), 1))).toBe('2026-06-08');
  });

  it('13. Saturday +1 working day → next Monday', () => {
    expect(key(addPolishWorkingDays(D('2026-06-06'), 1))).toBe('2026-06-08');
  });

  it('14. anchor on Wed +7 wd (plain June week, no holiday in window)', () => {
    // 2026-06-08 Mon → +7 wd, crossing only one weekend.
    expect(key(addPolishWorkingDays(D('2026-06-08'), 7))).toBe('2026-06-17');
  });

  it('15. +7 wd crossing Boże Ciało (2026-06-04) pushes one extra day', () => {
    expect(key(addPolishWorkingDays(D('2026-05-27'), 7))).toBe('2026-06-08');
  });

  it('16. +7 wd crossing Poniedziałek Wielkanocny (2026-04-06)', () => {
    expect(key(addPolishWorkingDays(D('2026-03-30'), 7))).toBe('2026-04-09');
  });

  it('17. +7 wd crossing Święto Pracy + Konstytucji (2026-05-01/03)', () => {
    expect(key(addPolishWorkingDays(D('2026-04-30'), 7))).toBe('2026-05-12');
  });

  it('18. +7 wd crossing Wniebowzięcie NMP (2026-08-15, a Saturday)', () => {
    // 08-15 is a Saturday in 2026 → already a non-working weekend day, so it
    // does NOT add an extra working day beyond the normal weekend skip.
    expect(key(addPolishWorkingDays(D('2026-08-10'), 7))).toBe('2026-08-19');
  });

  it('19. +7 wd crossing Wszystkich Świętych (2026-11-01, Sunday)', () => {
    // 11-01 is a Sunday in 2026 (already non-working); 11-11 is outside window.
    expect(key(addPolishWorkingDays(D('2026-10-26'), 7))).toBe('2026-11-04');
  });

  it('20. +7 wd crossing Niepodległości (2026-11-11, Wednesday)', () => {
    expect(key(addPolishWorkingDays(D('2026-11-05'), 7))).toBe('2026-11-17');
  });

  it('21. +1 wd crossing the Christmas pair (2025-12-25/26) + weekend', () => {
    // anchor Wed 2025-12-24: 25 Thu + 26 Fri are holidays, 27/28 weekend → 29 Mon.
    expect(key(addPolishWorkingDays(D('2025-12-24'), 1))).toBe('2025-12-29');
  });

  it('22. year-boundary roll: +7 wd from 2025-12-29 crosses Nowy Rok', () => {
    expect(key(addPolishWorkingDays(D('2025-12-29'), 7))).toBe('2026-01-09');
  });

  it('23. year-boundary roll crossing BOTH Nowy Rok and Trzech Króli', () => {
    expect(key(addPolishWorkingDays(D('2025-12-22'), 7))).toBe('2026-01-05');
  });

  it('24. +7 wd from a Jan 2 anchor inside the new year', () => {
    expect(key(addPolishWorkingDays(D('2026-01-02'), 7))).toBe('2026-01-14');
  });

  it('25. +7 wd across the December holidays into the next year', () => {
    expect(key(addPolishWorkingDays(D('2026-12-23'), 7))).toBe('2027-01-05');
  });
});

// ─── 4. workingDaysBetween (signed) ──────────────────────

describe('workingDaysBetween — signed, exclusive start / inclusive end', () => {
  it('26. same day → 0', () => {
    expect(workingDaysBetween(D('2026-06-01'), D('2026-06-01'))).toBe(0);
  });

  it('27. Mon → next Mon spanning a weekend AND Boże Ciało → 4', () => {
    // 06-02,06-03,[06-04 Boże Ciało],06-05,[weekend],06-08 = Tue,Wed,Fri,Mon = 4.
    expect(workingDaysBetween(D('2026-06-01'), D('2026-06-08'))).toBe(4);
  });

  it('28. reverse direction is the negative count', () => {
    expect(workingDaysBetween(D('2026-06-08'), D('2026-06-01'))).toBe(-4);
  });

  it('29. straddling Christmas pair + weekend → only the trailing Monday', () => {
    // a=12-24: count 12-25(hol),12-26(hol),12-27(Sat),12-28(Mon) → 1.
    expect(workingDaysBetween(D('2026-12-24'), D('2026-12-28'))).toBe(1);
  });

  it('30. straddling Święto Pracy (Fri) + Sunday Konstytucji → only Monday', () => {
    // a=04-30: 05-01(hol),05-02(Sat),05-03(Sun hol),05-04(Mon) → 1.
    expect(workingDaysBetween(D('2026-04-30'), D('2026-05-04'))).toBe(1);
  });

  it('31. year-boundary span across Nowy Rok + Trzech Króli', () => {
    // a=2025-12-31: count 01-01(hol),01-02(Fri),01-03/04(weekend),01-05(Mon),
    // 01-06(hol),01-07(Wed) → Fri,Mon,Wed = 3.
    expect(workingDaysBetween(D('2025-12-31'), D('2026-01-07'))).toBe(3);
  });
});

// ─── 5. bucketForAnchor (SLA = 7 wd, dueSoon ≤ 3) ────────

describe('bucketForAnchor — deadline + bucket classification', () => {
  it('32. fresh anchor (now == anchor) → 7 left, onTrack', () => {
    const r = bucketForAnchor(D('2026-06-01'), D('2026-06-01'));
    expect(key(r.deadline)).toBe('2026-06-11');
    expect(r.workingDaysLeft).toBe(7);
    expect(r.bucket).toBe('onTrack');
  });

  it('33. 4 working days left → still onTrack (just above the dueSoon edge)', () => {
    const r = bucketForAnchor(D('2026-06-01'), D('2026-06-05'));
    expect(r.workingDaysLeft).toBe(4);
    expect(r.bucket).toBe('onTrack');
  });

  it('34. exactly 3 working days left → dueSoon (upper boundary inclusive)', () => {
    const r = bucketForAnchor(D('2026-06-01'), D('2026-06-08'));
    expect(r.workingDaysLeft).toBe(3);
    expect(r.bucket).toBe('dueSoon');
  });

  it('35. 1 working day left → dueSoon', () => {
    const r = bucketForAnchor(D('2026-06-01'), D('2026-06-10'));
    expect(r.workingDaysLeft).toBe(1);
    expect(r.bucket).toBe('dueSoon');
  });

  it('36. exactly at the deadline → 0 left, dueSoon (lower boundary inclusive)', () => {
    const r = bucketForAnchor(D('2026-06-01'), D('2026-06-11'));
    expect(r.workingDaysLeft).toBe(0);
    expect(r.bucket).toBe('dueSoon');
  });

  it('37. one working day past the deadline → -1, overdue', () => {
    const r = bucketForAnchor(D('2026-06-01'), D('2026-06-12'));
    expect(r.workingDaysLeft).toBe(-1);
    expect(r.bucket).toBe('overdue');
  });

  it('38. well past the deadline → negative, overdue (overdue wins)', () => {
    const r = bucketForAnchor(D('2026-06-01'), D('2026-06-15'));
    expect(r.workingDaysLeft).toBe(-2);
    expect(r.bucket).toBe('overdue');
  });

  it('39. anchor whose 7-wd deadline crosses Boże Ciało lands on the right day', () => {
    const r = bucketForAnchor(D('2026-05-27'), D('2026-05-27'));
    expect(key(r.deadline)).toBe('2026-06-08');
    expect(r.workingDaysLeft).toBe(7);
    expect(r.bucket).toBe('onTrack');
  });

  it('40. year-boundary anchor (deadline rolls into January)', () => {
    const r = bucketForAnchor(D('2025-12-22'), D('2025-12-22'));
    expect(key(r.deadline)).toBe('2026-01-05');
    expect(r.bucket).toBe('onTrack');
  });

  it('41. weekend-adjacent now after a year-boundary anchor → dueSoon near edge', () => {
    // anchor 2025-12-29 → deadline 2026-01-09 (Fri). now 2026-01-08 (Thu) → 1 left.
    const r = bucketForAnchor(D('2025-12-29'), D('2026-01-08'));
    expect(key(r.deadline)).toBe('2026-01-09');
    expect(r.workingDaysLeft).toBe(1);
    expect(r.bucket).toBe('dueSoon');
  });

  it('42. now on a weekend still classifies by working-day distance', () => {
    // anchor 2026-06-01, deadline 06-11 (Thu); now Sat 06-06 → working days
    // 06-08,06-09,06-10,06-11 = 4 left → onTrack.
    const r = bucketForAnchor(D('2026-06-01'), D('2026-06-06'));
    expect(r.workingDaysLeft).toBe(4);
    expect(r.bucket).toBe('onTrack');
  });
});
