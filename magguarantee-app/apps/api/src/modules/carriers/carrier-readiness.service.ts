import { Injectable, NotFoundException } from '@nestjs/common';

import type { CarrierAttentionReason } from '@magguarantee/shared';

import { CarriersRepository } from './carriers.repository';

/**
 * Computed readiness of a single carrier. SINGLE SOURCE OF TRUTH for the
 * three consumers (opiekun fleet "attention" flags, the hard block on
 * delegation creation, and the carrier-portal eligibility flag).
 *
 * Derived entirely from existing fields — no DB migration:
 *  - `hasVehicle` / `hasTrailer` / `hasDriver` — count of active
 *    (`active:true`, `deletedAt:null`) children > 0 (the existing onboarding
 *    counts mechanism).
 *  - `incompleteFleet` — NOT (vehicle AND trailer AND driver).
 *  - `ready` — full fleet (active vehicle AND trailer AND driver).
 *
 * ADR removed (2026-07): the carrier-level ADR document is no longer a
 * concept, so readiness no longer depends on ADR at all. `ready` is now simply
 * "the fleet is complete" — ADR lives per-vehicle (flag) and per-driver
 * (świadectwo scan) and never gates delegation creation.
 */
export interface CarrierReadiness {
  hasVehicle: boolean;
  hasTrailer: boolean;
  hasDriver: boolean;
  incompleteFleet: boolean;
  ready: boolean;
}

/**
 * Minimal per-carrier inputs the pure readiness function needs. Both the
 * single-carrier path and the batched list path normalise their queries into
 * this shape before deriving the booleans, so the derivation logic lives in
 * exactly one place (`deriveReadiness`).
 */
export interface CarrierReadinessInputs {
  activeVehicles: number;
  activeTrailers: number;
  activeDrivers: number;
}

/**
 * Carrier-readiness computation shared by all three consumers.
 *
 * Per the wave brief the rule is defined ONCE here and reused — never
 * duplicated. Two entry points:
 *  - `forCarrier(carrierId)` — single carrier, used by the delegation hard
 *    block and the carrier eligibility flag. One read (the carrier row carries
 *    the active fleet counts via `_count`).
 *  - `forCarriers(inputsById)` — derives readiness for a pre-fetched batch
 *    (used by the opiekun fleet list, which aggregates the counts itself to
 *    avoid an N+1).
 */
@Injectable()
export class CarrierReadinessService {
  constructor(private readonly carriers: CarriersRepository) {}

  /**
   * Computes readiness for one carrier. The carrier's active fleet counts come
   * from the existing `_count` mechanism on `CarrierRow` — a single read.
   *
   * @throws NotFoundException when the carrier does not exist (or is
   *   soft-deleted) — callers that only need a boolean should catch or
   *   pre-validate. The delegation flow resolves the carrier first, so this
   *   is defensive.
   */
  async forCarrier(carrierId: string): Promise<CarrierReadiness> {
    const carrier = await this.carriers.findById(carrierId);
    if (!carrier) {
      throw new NotFoundException('Przewoźnik nie znaleziony');
    }
    return deriveReadiness({
      activeVehicles: carrier.counts.vehicles,
      activeTrailers: carrier.counts.trailers,
      activeDrivers: carrier.counts.drivers,
    });
  }

  /**
   * Derives readiness for a batch of carriers whose counts were already
   * fetched by the caller (e.g. the opiekun fleet aggregate). Pure — no DB
   * access — so the LIST consumer can batch its own queries and stay O(1)
   * round-trips. Returns a map keyed by the same ids passed in.
   */
  forCarriers(
    inputsById: Map<string, CarrierReadinessInputs>,
  ): Map<string, CarrierReadiness> {
    const out = new Map<string, CarrierReadiness>();
    for (const [id, inputs] of inputsById) {
      out.set(id, deriveReadiness(inputs));
    }
    return out;
  }
}

/**
 * Pure derivation of the readiness booleans from the normalised count inputs.
 * Defined once — both the single-carrier and batched paths call it so the
 * rule can never drift between consumers.
 */
export function deriveReadiness(
  inputs: CarrierReadinessInputs,
): CarrierReadiness {
  const hasVehicle = inputs.activeVehicles > 0;
  const hasTrailer = inputs.activeTrailers > 0;
  const hasDriver = inputs.activeDrivers > 0;

  const incompleteFleet = !(hasVehicle && hasTrailer && hasDriver);
  const ready = !incompleteFleet;

  return {
    hasVehicle,
    hasTrailer,
    hasDriver,
    incompleteFleet,
    ready,
  };
}

/**
 * Maps a `CarrierReadiness` to the opiekun-facing `attentionReasons` array.
 * Empty array means the carrier is ready. `incompleteFleet` is now the only
 * possible reason (ADR removed 2026-07). Lives here (next to the rule) so the
 * wire enum and the derivation can't drift.
 */
export function readinessToAttentionReasons(
  readiness: CarrierReadiness,
): CarrierAttentionReason[] {
  const reasons: CarrierAttentionReason[] = [];
  if (readiness.incompleteFleet) reasons.push('incompleteFleet');
  return reasons;
}
