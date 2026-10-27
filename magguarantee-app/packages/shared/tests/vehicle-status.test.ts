// Fixture suite for the delegation-driven vehicle lifecycle classifier
// (`computeVehicleLifecycleStatus`, Vehicle-status rework Step A).
//
// Per repo culture (see km-calc / guarantee-watchdog fixtures) there is NO real
// production data — every expected value is hand-derived. The classifier is
// pure: all dates are passed in, so the assertions are deterministic without
// any clock mocking.
//
// Date convention used below:
//   - `U('YYYY-MM-DD')` → UTC midnight (the date-only convention for `today`; a
//     UTC-midnight instant maps to the SAME Warsaw calendar day in both CET and
//     CEST, so the day-count is exact — and it is also a valid wall-clock
//     `lastReturnAt`, "returned at 00:00 of that day").
//   - `at('YYYY-MM-DDTHH:MM:SSZ')` → a full timestamp: for `createdAt` a TRUE
//     instant reduced to its Warsaw calendar date; for `lastReturnAt` a Warsaw
//     wall-clock LABELLED UTC (docs/19 #16) whose date is the raw `T`-part's
//     date — see the UWAGI #26 block at the bottom. `anchorAt` reports the
//     reduced day (UTC midnight), not the raw input.

import { describe, expect, it } from 'vitest';

import {
  VEHICLE_NIEAKTYWNA_MAX_DAYS,
  VEHICLE_STOJACA_MAX_DAYS,
  computeVehicleLifecycleStatus,
  type VehicleLifecycleInput,
} from '../src/domain/vehicle-status';

/** `YYYY-MM-DD` → UTC-midnight Date (date-only convention). */
function U(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, d as number));
}

/** Arbitrary instant from an ISO string. */
function at(s: string): Date {
  return new Date(s);
}

const TODAY = U('2026-07-30');

/** Base counting input: active, no active delegation, never returned. */
function baseInput(overrides: Partial<VehicleLifecycleInput> = {}): VehicleLifecycleInput {
  return {
    today: TODAY,
    active: true,
    hasActiveDelegation: false,
    lastReturnAt: null,
    createdAt: at('2026-07-30T08:00:00Z'),
    ...overrides,
  };
}

describe('computeVehicleLifecycleStatus — constants', () => {
  it('exports the documented day thresholds (14 / 28)', () => {
    expect(VEHICLE_STOJACA_MAX_DAYS).toBe(14);
    expect(VEHICLE_NIEAKTYWNA_MAX_DAYS).toBe(28);
  });
});

describe('computeVehicleLifecycleStatus — short-circuits', () => {
  it('wylaczona when !active — all anchor fields null (even with delegation + return)', () => {
    const res = computeVehicleLifecycleStatus(
      baseInput({
        active: false,
        hasActiveDelegation: true,
        lastReturnAt: U('2020-01-01'),
      }),
    );
    expect(res).toEqual({
      status: 'wylaczona',
      daysSinceReturn: null,
      anchorAt: null,
      anchorSource: null,
    });
  });

  it('aktywna when active + hasActiveDelegation — all anchor fields null', () => {
    const res = computeVehicleLifecycleStatus(
      baseInput({ hasActiveDelegation: true }),
    );
    expect(res).toEqual({
      status: 'aktywna',
      daysSinceReturn: null,
      anchorAt: null,
      anchorSource: null,
    });
  });

  it('active delegation silences the idle clock even when the last return is ancient', () => {
    const res = computeVehicleLifecycleStatus(
      baseInput({ hasActiveDelegation: true, lastReturnAt: U('2020-01-01') }),
    );
    expect(res.status).toBe('aktywna');
    expect(res.daysSinceReturn).toBeNull();
  });
});

describe('computeVehicleLifecycleStatus — anchor selection', () => {
  it('never returned → anchor is createdAt, source "created"', () => {
    const created = at('2026-07-16T09:00:00Z'); // Warsaw 2026-07-16
    const res = computeVehicleLifecycleStatus(
      baseInput({ lastReturnAt: null, createdAt: created }),
    );
    expect(res.anchorSource).toBe('created');
    expect(res.anchorAt).toEqual(U('2026-07-16')); // the Warsaw day, not the instant
    // 2026-07-30 − 2026-07-16 = 14 → stojaca boundary.
    expect(res.daysSinceReturn).toBe(14);
    expect(res.status).toBe('stojaca');
  });

  it('lastReturnAt takes precedence over createdAt (source "zjechal")', () => {
    const created = at('2026-01-01T00:00:00Z'); // far older
    const returned = U('2026-07-15');
    const res = computeVehicleLifecycleStatus(
      baseInput({ lastReturnAt: returned, createdAt: created }),
    );
    expect(res.anchorSource).toBe('zjechal');
    expect(res.anchorAt).toEqual(returned); // already a day — reported unchanged
    // Anchored on the return (15 days), NOT createdAt (which would be ~210).
    expect(res.daysSinceReturn).toBe(15);
    expect(res.status).toBe('nieaktywna');
  });

  it('createdAt is reduced to its Warsaw calendar date (late-UTC crosses to next day)', () => {
    // 23:00 UTC on 2026-07-01 = 01:00 CEST on 2026-07-02 → Warsaw date 07-02.
    const created = at('2026-07-01T23:00:00Z');
    const res = computeVehicleLifecycleStatus(
      baseInput({ lastReturnAt: null, createdAt: created }),
    );
    // 2026-07-30 − 2026-07-02 = 28 (NOT 29, which the raw UTC date would give).
    expect(res.daysSinceReturn).toBe(28);
    expect(res.status).toBe('nieaktywna');
  });
});

describe('computeVehicleLifecycleStatus — day-boundary buckets', () => {
  it.each([
    ['2026-07-30', 0, 'stojaca'],
    ['2026-07-16', 14, 'stojaca'],
    ['2026-07-15', 15, 'nieaktywna'],
    ['2026-07-02', 28, 'nieaktywna'],
    ['2026-07-01', 29, 'do_usuniecia'],
  ] as const)(
    'lastReturnAt=%s → %d calendar days → %s',
    (returnIso, expectedDays, expectedStatus) => {
      const res = computeVehicleLifecycleStatus(
        baseInput({ lastReturnAt: U(returnIso) }),
      );
      expect(res.daysSinceReturn).toBe(expectedDays);
      expect(res.status).toBe(expectedStatus);
      expect(res.anchorSource).toBe('zjechal');
    },
  );

  it('clamps a future-dated anchor to 0 days → stojaca', () => {
    const res = computeVehicleLifecycleStatus(
      baseInput({ lastReturnAt: U('2026-08-15') }), // after today
    );
    expect(res.daysSinceReturn).toBe(0);
    expect(res.status).toBe('stojaca');
  });

  it('far-past anchor → do_usuniecia', () => {
    const res = computeVehicleLifecycleStatus(
      baseInput({ lastReturnAt: U('2026-01-01') }),
    );
    expect(res.status).toBe('do_usuniecia');
    expect(res.daysSinceReturn).toBeGreaterThan(VEHICLE_NIEAKTYWNA_MAX_DAYS);
  });
});

// UWAGI #26 (fixed 2026-10-27): `lastReturnAt` is `Delegation.actualReturnAt`,
// a Warsaw wall-clock LABELLED UTC (docs/19 #16). Its calendar date is the raw
// `T`-part's date; the Warsaw reduction that `createdAt` gets would count a
// late-evening return as the next day and leave the bucket one day behind.
describe('computeVehicleLifecycleStatus — wall-clock lastReturnAt (UWAGI #26)', () => {
  it.each([
    // CET: 23:30 on 13.01 → 15 days to 28.01 (the Warsaw reduction said 14).
    ['2026-01-13T23:30:00Z', '2026-01-28', '2026-01-13', 15, 'nieaktywna'],
    // CEST: 22:30 on 01.07 → 15 days to 16.07 (the Warsaw reduction said 14).
    ['2026-07-01T22:30:00Z', '2026-07-16', '2026-07-01', 15, 'nieaktywna'],
    // CET, the 28/29 boundary: 23:59 on 01.01 → 29 days to 30.01 (was 28).
    ['2026-01-01T23:59:00Z', '2026-01-30', '2026-01-01', 29, 'do_usuniecia'],
    // A daytime return was never affected.
    ['2026-07-01T14:00:00Z', '2026-07-16', '2026-07-01', 15, 'nieaktywna'],
    // Wall-clock midnight of the day itself.
    ['2026-07-02T00:00:00Z', '2026-07-16', '2026-07-02', 14, 'stojaca'],
  ] as const)(
    'lastReturnAt=%s, today=%s → anchor day %s, %d days → %s',
    (returnIso, todayIso, anchorDayIso, expectedDays, expectedStatus) => {
      const res = computeVehicleLifecycleStatus(
        baseInput({ today: U(todayIso), lastReturnAt: at(returnIso) }),
      );
      expect(res.daysSinceReturn).toBe(expectedDays);
      expect(res.status).toBe(expectedStatus);
      expect(res.anchorSource).toBe('zjechal');
      expect(res.anchorAt).toEqual(U(anchorDayIso));
    },
  );

  it('createdAt stays a TRUE instant: the same late-evening value lands on the next Warsaw day', () => {
    // 23:30Z on 13.01 IS 00:30 CET on 14.01 for a true instant → 14 days to 28.01.
    const res = computeVehicleLifecycleStatus(
      baseInput({
        today: U('2026-01-28'),
        lastReturnAt: null,
        createdAt: at('2026-01-13T23:30:00Z'),
      }),
    );
    expect(res.daysSinceReturn).toBe(14);
    expect(res.status).toBe('stojaca');
    expect(res.anchorSource).toBe('created');
    expect(res.anchorAt).toEqual(U('2026-01-14'));
  });
});
