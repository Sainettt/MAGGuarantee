import {
  GpsMockProvider,
  djb2,
  rand,
} from '../providers/gps-mock.provider';
import type { GpsVehicleRef } from '../gps.types';

const VEHICLE: GpsVehicleRef = {
  id: '11111111-1111-4111-8111-111111111111',
  plateNumber: 'WA12345',
};
const OTHER: GpsVehicleRef = {
  id: '22222222-2222-4222-8222-222222222222',
  plateNumber: 'KR98765',
};

describe('GpsMockProvider', () => {
  let provider: GpsMockProvider;

  beforeEach(() => {
    provider = new GpsMockProvider();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('produces one position per input vehicle', async () => {
    const out = await provider.getCurrentPositions([VEHICLE, OTHER]);
    expect(out).toHaveLength(2);
    expect(out[0]?.vehicleId).toBe(VEHICLE.id);
    expect(out[1]?.vehicleId).toBe(OTHER.id);
  });

  it('source is "mock" on every fix', async () => {
    const out = await provider.getCurrentPositions([VEHICLE]);
    expect(out[0]?.source).toBe('mock');
  });

  it('positions land inside the Poland-ish bounding box', async () => {
    const out = await provider.getCurrentPositions([VEHICLE, OTHER]);
    for (const p of out) {
      expect(p.lat).toBeGreaterThanOrEqual(48.99);
      expect(p.lat).toBeLessThanOrEqual(54.01);
      expect(p.lng).toBeGreaterThanOrEqual(13.99);
      expect(p.lng).toBeLessThanOrEqual(24.01);
    }
  });

  it('same plate + same minute → same position (deterministic)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-03T12:00:30.000Z'));
    const a = await provider.getCurrentPositions([VEHICLE]);
    jest.setSystemTime(new Date('2026-05-03T12:00:45.000Z'));
    const b = await provider.getCurrentPositions([VEHICLE]);
    expect(a[0]?.lat).toBe(b[0]?.lat);
    expect(a[0]?.lng).toBe(b[0]?.lng);
    expect(a[0]?.speedKmh).toBe(b[0]?.speedKmh);
  });

  it('different minute → wobble (positions diverge)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-03T12:00:30.000Z'));
    const a = await provider.getCurrentPositions([VEHICLE]);
    jest.setSystemTime(new Date('2026-05-03T12:01:30.000Z'));
    const b = await provider.getCurrentPositions([VEHICLE]);
    // Either lat or lng must change between minutes (or speed). The exact
    // delta is small, but it's deterministic and non-zero.
    const moved =
      a[0]?.lat !== b[0]?.lat ||
      a[0]?.lng !== b[0]?.lng ||
      a[0]?.speedKmh !== b[0]?.speedKmh;
    expect(moved).toBe(true);
  });

  it('different plates produce different centroids', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-03T12:00:30.000Z'));
    const out = await provider.getCurrentPositions([VEHICLE, OTHER]);
    expect(out[0]?.lat).not.toBe(out[1]?.lat);
  });

  it('speedKmh stays within [0, 90]', async () => {
    // Sample 200 minutes worth of fixes — deterministic but covers the range.
    jest.useFakeTimers();
    const seen: number[] = [];
    for (let m = 0; m < 200; m++) {
      jest.setSystemTime(new Date(2026, 4, 3, 12, m, 0));
      const out = await provider.getCurrentPositions([VEHICLE]);
      seen.push(out[0]!.speedKmh ?? -1);
    }
    for (const s of seen) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(90);
    }
    // Sanity: at least one parked sample (~10% probability).
    expect(seen.some((s) => s === 0)).toBe(true);
    // Sanity: at least one moving sample.
    expect(seen.some((s) => s > 0)).toBe(true);
  });

  it('headingDeg stays within [0, 359]', async () => {
    jest.useFakeTimers();
    for (let m = 0; m < 50; m++) {
      jest.setSystemTime(new Date(2026, 4, 3, 12, m, 0));
      const out = await provider.getCurrentPositions([VEHICLE]);
      expect(out[0]?.headingDeg).toBeGreaterThanOrEqual(0);
      expect(out[0]?.headingDeg).toBeLessThanOrEqual(359);
    }
  });

  it('recordedAt is in [now-60s, now]', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-05-03T12:00:30.000Z');
    jest.setSystemTime(now);
    const out = await provider.getCurrentPositions([VEHICLE]);
    const rec = new Date(out[0]!.recordedAt).getTime();
    expect(rec).toBeLessThanOrEqual(now.getTime());
    expect(rec).toBeGreaterThanOrEqual(now.getTime() - 60_000);
  });

  it('getTrips returns []', async () => {
    const out = await provider.getTrips();
    expect(out).toEqual([]);
  });
});

describe('hash helpers', () => {
  it('djb2 is deterministic', () => {
    expect(djb2('foo')).toBe(djb2('foo'));
    expect(djb2('foo')).not.toBe(djb2('bar'));
  });

  it('rand returns a value in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const v = rand(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
