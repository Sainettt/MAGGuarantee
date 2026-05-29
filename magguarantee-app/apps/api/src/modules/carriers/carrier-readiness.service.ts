import { Injectable, NotFoundException } from '@nestjs/common';

import type { CarrierAttentionReason } from '@magguarantee/shared';

import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { CarrierAttachmentsRepository } from './carrier-attachments.repository';
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
 *  - `hasAdrVehicle` — exists an active ADR vehicle (`adr:true`).
 *  - `hasAdrDoc` — exists an active `adr`-category carrier attachment.
 *  - `incompleteFleet` — NOT (vehicle AND trailer AND driver).
 *  - `adrDocMissing` — has an ADR vehicle but no ADR document.
 *  - `ready` — full fleet AND (no ADR vehicle OR an ADR doc on file).
 */
export interface CarrierReadiness {
  hasVehicle: boolean;
  hasTrailer: boolean;
  hasDriver: boolean;
  hasAdrVehicle: boolean;
  hasAdrDoc: boolean;
  incompleteFleet: boolean;
  adrDocMissing: boolean;
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
  activeAdrVehicles: number;
  activeAdrDocs: number;
}

/**
 * Carrier-readiness computation shared by all three consumers.
 *
 * Per the wave brief the rule is defined ONCE here and reused — never
 * duplicated. Two entry points:
 *  - `forCarrier(carrierId)` — single carrier, used by the delegation hard
 *    block and the carrier eligibility flag. Three parallel queries.
 *  - `forCarriers(inputsById)` — derives readiness for a pre-fetched batch
 *    (used by the opiekun fleet list, which aggregates the counts itself to
 *    avoid an N+1).
 */
@Injectable()
export class CarrierReadinessService {
  constructor(
    private readonly carriers: CarriersRepository,
    private readonly vehicles: VehiclesRepository,
    private readonly attachments: CarrierAttachmentsRepository,
  ) {}

  /**
   * Computes readiness for one carrier. The carrier's active fleet counts come
   * from the existing `_count` mechanism on `CarrierRow`; the ADR-vehicle and
   * ADR-doc counts come from focused `count` queries. All three reads run in
   * parallel.
   *
   * @throws NotFoundException when the carrier does not exist (or is
   *   soft-deleted) — callers that only need a boolean should catch or
   *   pre-validate. The delegation flow resolves the carrier first, so this
   *   is defensive.
   */
  async forCarrier(carrierId: string): Promise<CarrierReadiness> {
    const [carrier, activeAdrVehicles, activeAdrDocs] = await Promise.all([
      this.carriers.findById(carrierId),
      this.vehicles.countActiveAdr(carrierId),
      this.attachments.countActiveByCategory(carrierId, 'adr'),
    ]);
    if (!carrier) {
      throw new NotFoundException('Przewoźnik nie znaleziony');
    }
    return deriveReadiness({
      activeVehicles: carrier.counts.vehicles,
      activeTrailers: carrier.counts.trailers,
      activeDrivers: carrier.counts.drivers,
      activeAdrVehicles,
      activeAdrDocs,
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
  const hasAdrVehicle = inputs.activeAdrVehicles > 0;
  const hasAdrDoc = inputs.activeAdrDocs > 0;

  const incompleteFleet = !(hasVehicle && hasTrailer && hasDriver);
  // An ADR document is only required when the carrier actually operates an
  // ADR vehicle. Non-ADR fleets are never blocked on the ADR doc.
  const adrDocMissing = hasAdrVehicle && !hasAdrDoc;
  const ready = !incompleteFleet && !adrDocMissing;

  return {
    hasVehicle,
    hasTrailer,
    hasDriver,
    hasAdrVehicle,
    hasAdrDoc,
    incompleteFleet,
    adrDocMissing,
    ready,
  };
}

/**
 * Maps a `CarrierReadiness` to the opiekun-facing `attentionReasons` array.
 * Empty array means the carrier is ready. Order is stable: fleet first, then
 * the ADR doc. Lives here (next to the rule) so the wire enum and the
 * derivation can't drift.
 */
export function readinessToAttentionReasons(
  readiness: CarrierReadiness,
): CarrierAttentionReason[] {
  const reasons: CarrierAttentionReason[] = [];
  if (readiness.incompleteFleet) reasons.push('incompleteFleet');
  if (readiness.adrDocMissing) reasons.push('adrDocMissing');
  return reasons;
}
