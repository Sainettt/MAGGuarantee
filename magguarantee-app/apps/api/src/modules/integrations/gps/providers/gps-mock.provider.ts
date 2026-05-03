import { Injectable } from '@nestjs/common';

import type {
  GpsPosition,
  GpsProvider,
  GpsVehicleRef,
} from '../gps.types';

// Roughly Poland (49°–54° N, 14°–24° E). Mock fixes wander inside this box;
// frontend devs see "Polish-looking" map points without ever opening the
// vendor portal.
const LAT_MIN = 49;
const LAT_MAX = 54;
const LNG_MIN = 14;
const LNG_MAX = 24;

/**
 * Deterministic GPS provider used while MAGTRANS finalises real API access.
 *
 * Properties:
 *  - Same `plateNumber` ⇒ same centroid (computed via djb2 hash of the plate).
 *  - Same plate + same UTC minute ⇒ same returned position (the wobble is
 *    keyed on `Math.floor(Date.now() / 60000)`).
 *  - Different minute ⇒ tiny drift (~50–200 m), so the UI shows realistic
 *    "almost stationary" behaviour without ever hitting the network.
 *
 * Speed/heading are pseudo-random within sane bounds; ~10% of fixes report
 * `speed=0` to mimic parked vehicles.
 *
 * Source flag: 'mock'. Operators can grep audit / responses for this string
 * to confirm no mock data leaked into a vendor-mode env.
 */
@Injectable()
export class GpsMockProvider implements GpsProvider {
  readonly source = 'mock' as const;

  async getCurrentPositions(
    vehicles: GpsVehicleRef[],
  ): Promise<GpsPosition[]> {
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60_000);
    return vehicles.map((v) => this._positionFor(v, now, minute));
  }

  // Phase 11+ feature; mock returns empty.
  async getTrips(): Promise<[]> {
    return [];
  }

  // ── helpers ──────────────────────────────────────────────

  private _positionFor(
    v: GpsVehicleRef,
    now: Date,
    minute: number,
  ): GpsPosition {
    const seed = djb2(v.plateNumber);
    const centroidLat = LAT_MIN + (seed % 1_000) / 1_000 * (LAT_MAX - LAT_MIN);
    const centroidLng =
      LNG_MIN + ((seed >>> 10) % 1_000) / 1_000 * (LNG_MAX - LNG_MIN);

    // ±0.005° wobble (≈ 500 m at this latitude). Wobble seed mixes plate
    // hash with the current minute so successive minutes drift slightly.
    const wobbleLat = (rand(seed ^ minute) - 0.5) * 0.01;
    const wobbleLng = (rand((seed * 31) ^ minute) - 0.5) * 0.01;

    // Speed ∈ [0, 90]. ~10% of the time the vehicle is "parked" (speed=0).
    const speedRoll = rand((seed * 17) ^ minute);
    const speedKmh = speedRoll < 0.1 ? 0 : Math.floor(speedRoll * 90);

    const heading = Math.floor(rand((seed * 7) ^ minute) * 360) % 360;

    // recordedAt: 0–60 s before "now" — pretend the fix is from a recent
    // tracker ping rather than literally instantaneous.
    const lagSec = Math.floor(rand((seed * 13) ^ minute) * 60);
    const recordedAt = new Date(now.getTime() - lagSec * 1_000);

    return {
      vehicleId: v.id,
      plateNumber: v.plateNumber,
      lat: round6(centroidLat + wobbleLat),
      lng: round6(centroidLng + wobbleLng),
      speedKmh,
      headingDeg: heading,
      recordedAt: recordedAt.toISOString(),
      fetchedAt: now.toISOString(),
      ignitionOn: speedKmh > 0,
      odometerKm: null,
      source: 'mock',
    };
  }
}

// ── pure helpers (no Nest dependencies — also reused in the spec) ─────

/** djb2 string hash — small, fast, deterministic. */
export function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  // Force unsigned 31-bit so callers can mod safely.
  return h >>> 0;
}

/** Lightweight LCG-style PRNG keyed on an integer. Returns [0, 1). */
export function rand(seed: number): number {
  // Reuse Mulberry32 — small, fast, no external dep.
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) % 1_000_000) / 1_000_000;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
