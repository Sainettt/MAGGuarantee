// GPS provider abstraction.
//
// The wire format (`GpsPosition`, `GpsTrip`) lives in `@magguarantee/shared`.
// We re-export it from this module so api-side code has a single import
// surface and the controller / service / providers all agree on field shapes.

import type { GpsPosition, GpsTrip } from '@magguarantee/shared';

export type { GpsPosition, GpsTrip };

/**
 * Minimal vehicle slice the provider needs to issue a query. We DO NOT pass
 * Prisma rows to providers — that keeps the dependency graph clean and lets
 * `GpsMockProvider` be tested without touching the database.
 */
export interface GpsVehicleRef {
  id: string;
  plateNumber: string;
}

export interface GpsProvider {
  /** 'mock' | 'vendor' — also exposed on every produced position for tracing. */
  readonly source: 'mock' | 'vendor';

  /**
   * Fetch the current position for the supplied vehicles.
   *
   * Implementations may filter (skip) vehicles they have no fix for; the
   * caller decides what to do with missing entries (mock returns one fix
   * per input; the vendor stub will eventually do the same).
   */
  getCurrentPositions(
    vehicles: GpsVehicleRef[],
  ): Promise<GpsPosition[]>;

  /**
   * History endpoint — Phase 11+ only. Mock returns []; the vendor stub will
   * implement when credentials land. Optional in the interface so the mock
   * doesn't have to ship dead code today.
   */
  getTrips?(
    vehicle: GpsVehicleRef,
    from: Date,
    to: Date,
  ): Promise<GpsTrip[]>;
}
