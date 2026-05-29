import { ForbiddenException, Injectable } from '@nestjs/common';

import type {
  DriverListItem,
  MyFleetQuery,
  MyFleetResponse,
  OpiekunCarrierStats,
  OpiekunCarrierVehicleStats,
  OpiekunFleetResponse,
  TrailerListItem,
  VehicleListItem,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierAttachmentsRepository } from '../carriers/carrier-attachments.repository';
import {
  CarrierReadinessService,
  readinessToAttentionReasons,
  type CarrierReadiness,
} from '../carriers/carrier-readiness.service';
import {
  CarriersRepository,
  type OpiekunAggregateCarrierRow,
} from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';

/**
 * "Driving" cut-off — `Code.gs:2827` uses a constant 7-day window past
 * `lastDroveAt` to separate `jezdzace` from `stojace`. Kept here as a named
 * constant so the test fixtures can reference it directly.
 */
const DRIVING_RECENCY_DAYS = 7;
const DRIVING_RECENCY_MS = DRIVING_RECENCY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Phase 3 — Fleet aggregates service.
 *
 * Collapses the legacy `getMyFleet` (`Code.gs:4247-4291`) + the three
 * separate `getMyVehicles` / `getMyDrivers` / `getMyTrailers` calls into a
 * single round-trip. Used by the new-claim and new-delegation forms to
 * populate dropdowns.
 */
@Injectable()
export class FleetService {
  constructor(
    private readonly carriers: CarriersRepository,
    private readonly vehicles: VehiclesRepository,
    private readonly drivers: DriversRepository,
    private readonly trailers: TrailersRepository,
    private readonly readiness: CarrierReadinessService,
    private readonly carrierAttachments: CarrierAttachmentsRepository,
  ) {}

  async getMyFleet(
    user: AuthUser,
    query: MyFleetQuery = { includeInactive: false },
  ): Promise<MyFleetResponse> {
    if (user.role !== 'przewoznik') {
      throw new ForbiddenException('Wymaga konta przewoźnika');
    }
    const carriers = await this.carriers.list({ limit: 200 });
    const mine = carriers.find((c) => c.userId === user.sub);
    if (!mine) {
      throw new ForbiddenException('Brak profilu przewoźnika');
    }

    // `active` filter — when `includeInactive=true` (used by the new-claim
    // form so historical vehicles remain selectable) we omit the predicate
    // entirely; otherwise the active-only default keeps the new-delegation
    // dropdown lean.
    const activeFilter = query.includeInactive ? undefined : true;

    const [vehicleRows, driverRows, trailerRows] = await Promise.all([
      this.vehicles.list({ carrierId: mine.id, active: activeFilter, limit: 200 }),
      this.drivers.list({ carrierId: mine.id, active: activeFilter, limit: 200 }),
      this.trailers.list({ carrierId: mine.id, active: activeFilter, limit: 200 }),
    ]);

    const vehicles: VehicleListItem[] = vehicleRows.map((v) => ({
      id: v.id,
      plateNumber: v.plateNumber,
      active: v.active,
      brand: v.brand,
      model: v.model,
      type: v.type,
      sideNumber: v.sideNumber,
    }));

    const drivers: DriverListItem[] = driverRows.map((d) => ({
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone,
      active: d.active,
      licenseExpiry: d.licenseExpiry
        ? toDateString(d.licenseExpiry)
        : null,
    }));

    const trailers: TrailerListItem[] = trailerRows.map((t) => ({
      id: t.id,
      plateNumber: t.plateNumber,
      active: t.active,
      trailerTypeId: t.trailerTypeId,
      trailerTypeName: t.trailerType.name,
      brand: t.brand,
      model: t.model,
    }));

    return { vehicles, drivers, trailers };
  }

  /**
   * Phase 5 — per-carrier fleet aggregate for the opiekun dashboard.
   *
   * Mirrors `Code.gs:2733-2820` (`getOpiekunFleet`) but reduced to the
   * payload the new dashboard actually consumes: identity + the four-bucket
   * vehicle classification (`jezdzace`, `stojace`, `nieaktywne`,
   * `potencjalne`). Drivers / trailers / per-vehicle list endpoints already
   * exist as dedicated routes, so we don't duplicate them here.
   *
   * Role gating:
   *  - admin    → no scope filter (every non-soft-deleted carrier).
   *  - opiekun  → `Carrier.opiekunId === user.sub` only. Filtered server-side
   *               (the OpiekunOwnershipGuard is decorator-driven and targets
   *               single-resource lookups, not list-aggregates).
   *  - other    → 403 (defence in depth; `@Roles` on the controller is the
   *               primary gate).
   *
   * Query budget — O(1), not O(n): the carrier aggregate is one round-trip,
   * the ADR-vehicle counts are one batched `groupBy`, and the ADR-doc counts
   * are one batched `groupBy`. No per-carrier reads. The active vehicle /
   * trailer / driver counts come for free on the aggregate row (`_count`).
   */
  async getOpiekunFleet(user: AuthUser): Promise<OpiekunFleetResponse> {
    this._assertOpiekunOrAdmin(user);
    const rows = await this.carriers.listForOpiekunAggregate(
      user.role === 'opiekun' ? { opiekunId: user.sub } : {},
    );
    const readinessById = await this._computeReadinessBatch(rows);
    const now = Date.now();
    const carriers = rows.map((r) =>
      this._mapCarrierStats(r, now, readinessById.get(r.id)),
    );
    return {
      carriers,
      totals: this._buildTotals(carriers),
    };
  }

  /**
   * Builds readiness for the whole opiekun-scoped carrier set with TWO
   * batched queries (ADR vehicles + ADR docs, each `groupBy` carrierId) — no
   * per-carrier round trips. The active vehicle/trailer/driver counts are
   * already on the aggregate rows (`_count`), so we just zip them with the
   * two ADR maps and hand the normalised inputs to the pure
   * `CarrierReadinessService.forCarriers`.
   */
  private async _computeReadinessBatch(
    rows: OpiekunAggregateCarrierRow[],
  ): Promise<Map<string, CarrierReadiness>> {
    const carrierIds = rows.map((r) => r.id);
    const [adrVehicleCounts, adrDocCounts] = await Promise.all([
      this.vehicles.countActiveAdrByCarriers(carrierIds),
      this.carrierAttachments.countActiveByCategoryForCarriers(
        carrierIds,
        'adr',
      ),
    ]);
    const inputsById = new Map(
      rows.map((r) => [
        r.id,
        {
          activeVehicles: r.counts.vehicles,
          activeTrailers: r.counts.trailers,
          activeDrivers: r.counts.drivers,
          activeAdrVehicles: adrVehicleCounts.get(r.id) ?? 0,
          activeAdrDocs: adrDocCounts.get(r.id) ?? 0,
        },
      ]),
    );
    return this.readiness.forCarriers(inputsById);
  }

  // ── opiekun-fleet helpers ────────────────────────────────

  private _assertOpiekunOrAdmin(user: AuthUser): void {
    if (user.role !== 'admin' && user.role !== 'opiekun') {
      throw new ForbiddenException('Brak uprawnień (wymaga konta opiekuna)');
    }
  }

  private _mapCarrierStats(
    row: OpiekunAggregateCarrierRow,
    nowMs: number,
    readiness: CarrierReadiness | undefined,
  ): OpiekunCarrierStats {
    const vehicles = this._classifyVehicles(row, nowMs);
    return {
      carrierId: row.id,
      login: row.login,
      nazwa: row.name,
      firma: row.company,
      nip: row.nip,
      aktywny: row.active,
      liczbaWypisow: row.numberOfVehicle,
      vehicles,
      // `readiness` is always present in production (computed for every row);
      // the `?? []` is a defensive fallback so a missing key never crashes
      // the mapper (the carrier would simply show no attention flags).
      attentionReasons: readiness
        ? readinessToAttentionReasons(readiness)
        : [],
    };
  }

  /**
   * Four-bucket classification per `Code.gs:2825-2865`:
   *   - `nieaktywne`  — `Vehicle.active=false`
   *   - `jezdzace`    — `active=true` AND (no `lastDroveAt` OR within 7d)
   *   - `stojace`     — `active=true` AND `lastDroveAt` older than 7d
   *   - `potencjalne` — `max(0, numberOfVehicle ?? 0 − total)`. KREPTD
   *                     headroom; reflects the legacy "potencjalne auta z
   *                     KREPTD" calculation at line 2865.
   *   - `total`       — `jezdzace + stojace + nieaktywne`.
   */
  private _classifyVehicles(
    row: OpiekunAggregateCarrierRow,
    nowMs: number,
  ): OpiekunCarrierVehicleStats {
    let jezdzace = 0;
    let stojace = 0;
    let nieaktywne = 0;
    for (const v of row.vehicles) {
      if (!v.active) {
        nieaktywne += 1;
        continue;
      }
      // No data → assume driving (mirrors legacy default at line 2839).
      if (!v.lastDroveAt) {
        jezdzace += 1;
        continue;
      }
      const diffMs = nowMs - v.lastDroveAt.getTime();
      if (Number.isFinite(diffMs) && diffMs > DRIVING_RECENCY_MS) {
        stojace += 1;
      } else {
        jezdzace += 1;
      }
    }
    const total = jezdzace + stojace + nieaktywne;
    const kreptd = row.numberOfVehicle ?? 0;
    const potencjalne = Math.max(0, kreptd - total);
    return { jezdzace, stojace, nieaktywne, potencjalne, total };
  }

  private _buildTotals(rows: OpiekunCarrierStats[]) {
    const zero: OpiekunCarrierVehicleStats = {
      jezdzace: 0,
      stojace: 0,
      nieaktywne: 0,
      potencjalne: 0,
      total: 0,
    };
    const vehicles = rows.reduce<OpiekunCarrierVehicleStats>(
      (acc, r) => ({
        jezdzace: acc.jezdzace + r.vehicles.jezdzace,
        stojace: acc.stojace + r.vehicles.stojace,
        nieaktywne: acc.nieaktywne + r.vehicles.nieaktywne,
        potencjalne: acc.potencjalne + r.vehicles.potencjalne,
        total: acc.total + r.vehicles.total,
      }),
      zero,
    );
    return { liczbaPrzewoznikow: rows.length, vehicles };
  }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
