import { Injectable } from '@nestjs/common';

import { DelegationStatus as PrismaDelegationStatus } from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';
// REUSE the watchdog's active-delegation set — the SAME "≤1 active outing per
// vehicle" statuses ({zgloszony, gotowy, w_trasie}) the delegations module and
// the guarantee watchdog use. Importing the constant (a plain value) keeps the
// semantics in ONE place; do not fork the list. See
// guarantee-watchdog.repository.ts for the canonical declaration.
import { ACTIVE_DELEGATION_STATUSES } from '../guarantee-watchdog/guarantee-watchdog.repository';

/**
 * Per-vehicle delegation state the lifecycle classifier needs:
 *  - `hasActiveDelegation` — a non-terminal delegation (zgloszony/gotowy/
 *    w_trasie, non-soft-deleted) exists → the vehicle is `aktywna`.
 *  - `lastReturnAt` — `max(actualReturnAt)` over its zjechał, non-deleted
 *    delegations → the idle-clock anchor (`null` when it never returned).
 */
export interface VehicleDelegationStatus {
  hasActiveDelegation: boolean;
  lastReturnAt: Date | null;
}

/**
 * Batched delegation-status lookup for the vehicle lifecycle classifier — one
 * fetch for a whole page/aggregate of vehicles, NO N+1. Shared by both the
 * vehicles service (`list` batch / `getById` single) and the fleet aggregates
 * (opiekun / dyspozytor / planista).
 *
 * Mirrors `GuaranteeWatchdogRepository`'s two grouped reads
 * (`_latestZjechalReturnByVehicle` + the active-delegation existence check) but
 * generalises them to an arbitrary id set and folds both into ONE result map.
 *
 * Runs on `this.prisma.tx`: for the GET paths there is no ambient audit tx, so
 * `tx` is the root client; on the mutation paths (create/update/deactivate) it
 * enrols in the same transaction the audit interceptor opened, reading a
 * consistent snapshot.
 *
 * FUTURE (anti-abuse): once same-`(carrierId, plateNumber)` re-add is permitted
 * (the planned "no re-add for 3 months after admin deletion" rule), both the
 * active-delegation and last-return lookups here — and the caller's `createdAt`
 * anchor — must span the soft-deleted TOMBSTONE predecessors of the same
 * `(carrierId, plateNumber)` so a delete+recreate cannot reset the idle clock.
 * Today the DB `@@unique([carrierId, plateNumber])` blocks recreate, so a
 * row-level anchor (this vehicle id only, `deletedAt: null` delegations) is
 * observably equivalent.
 */
@Injectable()
export class VehicleDelegationStatusRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves `{ hasActiveDelegation, lastReturnAt }` for every id in
   * `vehicleIds`. Every requested id is present in the returned map (absent
   * delegations → `{ false, null }`). An empty input returns an empty map with
   * no query (Postgres rejects `IN ()`).
   */
  async getByVehicleIds(
    vehicleIds: string[],
  ): Promise<Map<string, VehicleDelegationStatus>> {
    const map = new Map<string, VehicleDelegationStatus>();
    if (vehicleIds.length === 0) return map;
    const ids = [...new Set(vehicleIds)];

    const [activeIds, lastReturns] = await Promise.all([
      this._activeDelegationVehicleIds(ids),
      this._latestZjechalReturnByVehicle(ids),
    ]);

    for (const id of ids) {
      map.set(id, {
        hasActiveDelegation: activeIds.has(id),
        lastReturnAt: lastReturns.get(id) ?? null,
      });
    }
    return map;
  }

  /** Set of vehicle ids holding ≥1 active (non-terminal, non-deleted) delegation. */
  private async _activeDelegationVehicleIds(
    vehicleIds: string[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.tx.delegation.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        status: { in: [...ACTIVE_DELEGATION_STATUSES] },
        deletedAt: null,
      },
      select: { vehicleId: true },
      distinct: ['vehicleId'],
    });
    return new Set(rows.map((r) => r.vehicleId));
  }

  /**
   * `max(actualReturnAt)` per vehicle over its zjechał, non-deleted delegations
   * — one grouped query for the whole id set (same shape as the watchdog's
   * `_latestZjechalReturnByVehicle`). Vehicles that never returned are simply
   * absent from the result map.
   */
  private async _latestZjechalReturnByVehicle(
    vehicleIds: string[],
  ): Promise<Map<string, Date>> {
    const groups = await this.prisma.tx.delegation.groupBy({
      by: ['vehicleId'],
      where: {
        vehicleId: { in: vehicleIds },
        status: PrismaDelegationStatus.zjechal,
        deletedAt: null,
        actualReturnAt: { not: null },
      },
      _max: { actualReturnAt: true },
    });
    const map = new Map<string, Date>();
    for (const g of groups) {
      if (g._max.actualReturnAt) map.set(g.vehicleId, g._max.actualReturnAt);
    }
    return map;
  }
}
