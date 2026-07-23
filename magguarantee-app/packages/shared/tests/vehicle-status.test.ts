// Fixture suite for the delegation-driven vehicle lifecycle classifier
// (`computeVehicleLifecycleStatus`, Vehicle-status rework Step A).
//
// Per repo culture (see km-calc / guarantee-watchdog fixtures) there is NO real
// production data — every expected value is hand-derived. The classifier is
// pure: all dates are passed in, so the assertions are deterministic without
// any clock mocking.
//
// Date convention used below:
//   - `U('YYYY-MM-DD')` → UTC midnight (the date-only convention for `today` and
//     `lastReturnAt`; a UTC-midnight instant maps to the SAME Warsaw calendar
//     day in both CET and CEST, so the day-count is exact).
//   - `at('YYYY-MM-DDTHH:MM:SSZ')` → an arbitrary instant (for `createdAt`,
//     which is a full timestamp reduced to its Warsaw calendar date).

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
    expect(res.anchorAt).toBe(created);
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
    expect(res.anchorAt).toBe(returned);
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
