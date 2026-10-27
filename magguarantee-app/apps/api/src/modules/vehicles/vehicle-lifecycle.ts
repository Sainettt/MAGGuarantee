import {
  computeVehicleLifecycleStatus,
  type VehicleLifecycleStatus,
} from '@magguarantee/shared';

import type { VehicleDelegationStatus } from './vehicle-delegation-status.repository';

/**
 * The two DERIVED lifecycle fields surfaced on the vehicle DTOs / fleet items.
 * `status` is the read-time classification; `daysSinceReturn` is the calendar
 * days since the idle anchor (`null` when no idle clock runs — `wylaczona` /
 * `aktywna`). The anchor day is the raw date part of the wall-clock-labelled
 * `lastReturnAt`, else the Warsaw date of the true-instant `createdAt`
 * (docs/19 #16; UWAGI #26, 2026-10-27).
 */
export interface VehicleLifecycleInfo {
  status: VehicleLifecycleStatus;
  daysSinceReturn: number | null;
}

/**
 * Empty delegation state — a vehicle with no active delegation and no recorded
 * zjechał return. Used for freshly created vehicles (no delegations can exist
 * yet) and as the fallback when the batched lookup is unavailable.
 */
export const EMPTY_DELEGATION_STATUS: VehicleDelegationStatus = {
  hasActiveDelegation: false,
  lastReturnAt: null,
};

/**
 * Thin adapter around the pure `computeVehicleLifecycleStatus` (shared domain):
 * feeds a vehicle row's `active`/`createdAt` plus its resolved delegation state
 * and a pre-computed `today`, and projects the result down to the DTO fields.
 * Shared by the vehicles service and the fleet aggregates so both classify
 * identically.
 */
export function computeVehicleLifecycle(
  vehicle: { active: boolean; createdAt: Date },
  delegation: VehicleDelegationStatus,
  today: Date,
): VehicleLifecycleInfo {
  const res = computeVehicleLifecycleStatus({
    today,
    active: vehicle.active,
    hasActiveDelegation: delegation.hasActiveDelegation,
    lastReturnAt: delegation.lastReturnAt,
    createdAt: vehicle.createdAt,
  });
  return { status: res.status, daysSinceReturn: res.daysSinceReturn };
}
