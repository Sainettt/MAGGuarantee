import { ForbiddenException, Injectable } from '@nestjs/common';

import type {
  DriverListItem,
  DyspozytorFleetResponse,
  DyspozytorFleetStats,
  DyspozytorStojacyItem,
  MyFleetQuery,
  MyFleetResponse,
  OpiekunCarrierStats,
  OpiekunCarrierVehicleStats,
  OpiekunFleetResponse,
  PlanistaFleetResponse,
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
import { DriversRepository, type DriverRow } from '../drivers/drivers.repository';
import { TrailersRepository, type TrailerRow } from '../trailers/trailers.repository';
import {
  NO_TEAM_SENTINEL,
  VehiclesRepository,
  type VehicleRow,
} from '../vehicles/vehicles.repository';

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

    return {
      vehicles: vehicleRows.map(toVehicleListItem),
      drivers: driverRows.map(toDriverListItem),
      trailers: trailerRows.map(toTrailerListItem),
    };
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

  // ── Phase 6.1 — Planista read-only fleet ─────────────────

  /**
   * Read-only fleet view for the planista panel — mirrors `Code.gs:3583-3662`
   * (`getPlanistaFleet`) but replaces the Sheets full-scan + uppercase-name
   * matching antipattern with parameterised Prisma queries:
   *
   *  1. Vehicles where `Vehicle.plannerId === user.sub`. Admin callers get NO
   *     planner filter (debug-fallback, mirrors the opiekun admin-sees-all
   *     pattern + the carrier-panel admin debug-fallback in docs/03-roles.md).
   *  2. Distinct `carrierIds` derived from those vehicles → load that union's
   *     drivers + trailers (read-only). No vehicles → empty payload, no
   *     follow-up queries (Postgres can't `IN ()`).
   *
   * Read-only by contract — the planista mutates nothing (docs/03-roles.md
   * #planista). The slim list shapes match `getMyFleet` / `getOpiekunFleet`.
   *
   * Phase 6.4 — the planista panel now also surfaces a KPI strip + an
   * idle-vehicle highlight list, computed over the plannerId-scoped fleet with
   * the SAME `_buildDispatcherStats` helper the dyspozytor uses (identical
   * 7-day classification / `DRIVING_RECENCY_DAYS` cut-off), so the two panels
   * stay byte-identical. `stats`/`stojaceList` reuse the dyspozytor shapes.
   */
  async getPlanistaFleet(user: AuthUser): Promise<PlanistaFleetResponse> {
    this._assertRole(user, 'planista', 'Brak uprawnień (wymaga konta planisty)');
    const vehicleRows = await this.vehicles.list({
      // admin → no planner scope (sees every vehicle); planista → own only.
      plannerId: user.role === 'admin' ? undefined : user.sub,
      limit: 500,
    });
    const carrierIds = distinctCarrierIds(vehicleRows);
    const { drivers, trailers } = await this._loadCarrierDriversTrailers(
      carrierIds,
    );
    const { stats, stojaceList } = this._buildDispatcherStats(
      vehicleRows,
      drivers.length,
      trailers.length,
      Date.now(),
    );
    return {
      vehicles: vehicleRows.map(toVehicleListItem),
      drivers,
      trailers,
      stats,
      stojaceList,
    };
  }

  // ── Phase 6.2 — Dyspozytor read-only fleet + stats ───────

  /**
   * Read-only fleet view + KPI stats + idle-vehicle highlight list for the
   * dyspozytor panel — mirrors `Code.gs:3676-3772` (`getDyspozytorFleet`).
   *
   *  1. Phase 11 — vehicles of the dyspozytor's TEAM
   *     (`Vehicle.dispatchTeamId === user.teamId`; admin → all). A dyspozytor
   *     with NO team gets an EMPTY fleet (sentinel → early return below), never
   *     "all" — explicit per the locked decision.
   *  2. Distinct `carrierIds` → drivers + trailers (read-only).
   *  3. `stats` from the SAME 7-day classification opiekun uses
   *     (`_buildDispatcherStats` reuses the shared `DRIVING_RECENCY_DAYS`
   *     cut-off so "stojące" stays identical across opiekun + dyspozytor +
   *     legacy).
   *  4. `stojaceList` — one row per active vehicle idle > 7 days.
   */
  async getDyspozytorFleet(user: AuthUser): Promise<DyspozytorFleetResponse> {
    this._assertRole(
      user,
      'dyspozytor',
      'Brak uprawnień (wymaga konta dyspozytora)',
    );
    // A dyspozytor with no team → empty fleet (no query). Admin keeps all.
    if (user.role === 'dyspozytor' && !user.teamId) {
      return this._emptyDispatcherFleet();
    }
    const vehicleRows = await this.vehicles.list({
      dispatchTeamId:
        user.role === 'admin'
          ? undefined
          : (user.teamId ?? NO_TEAM_SENTINEL),
      limit: 500,
    });
    const carrierIds = distinctCarrierIds(vehicleRows);
    const { drivers, trailers } = await this._loadCarrierDriversTrailers(
      carrierIds,
    );
    const nowMs = Date.now();
    const { stats, stojaceList } = this._buildDispatcherStats(
      vehicleRows,
      drivers.length,
      trailers.length,
      nowMs,
    );
    return {
      vehicles: vehicleRows.map(toVehicleListItem),
      drivers,
      trailers,
      stats,
      stojaceList,
    };
  }

  // ── Phase 6 shared helpers ───────────────────────────────

  /**
   * Defence-in-depth role gate (the `@Roles(...)` decorator on the controller
   * is the primary one). `admin` always passes — every read-only panel honours
   * the admin debug-fallback. Any other role is rejected with the role-specific
   * message.
   */
  private _assertRole(
    user: AuthUser,
    role: AuthUser['role'],
    message: string,
  ): void {
    if (user.role !== 'admin' && user.role !== role) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * Loads the read-only driver + trailer slim-lists for a carrier union.
   * Short-circuits to empty lists on an empty `carrierIds` set (no vehicles →
   * no carriers → no follow-up query; Postgres rejects `IN ()`). Both reads run
   * in parallel and reuse the FK-indexed `carrierIds` repo filter.
   */
  private async _loadCarrierDriversTrailers(
    carrierIds: string[],
  ): Promise<{ drivers: DriverListItem[]; trailers: TrailerListItem[] }> {
    if (carrierIds.length === 0) {
      return { drivers: [], trailers: [] };
    }
    const [driverRows, trailerRows] = await Promise.all([
      this.drivers.list({ carrierIds, limit: 500 }),
      this.trailers.list({ carrierIds, limit: 500 }),
    ]);
    return {
      drivers: driverRows.map(toDriverListItem),
      trailers: trailerRows.map(toTrailerListItem),
    };
  }

  /**
   * Dyspozytor KPI stats + idle-vehicle list. Bucket rules (legacy
   * `Code.gs:3729-3766`):
   *   - `autaNieaktywne` — `active=false`.
   *   - `autaAktywne`    — `active=true`.
   *   - `autaJezdzace`   — active AND (no `lastDroveAt` OR within 7 days).
   *   - `autaStojace7dni`— active AND `lastDroveAt` older than 7 days.
   * Invariants: `jezdzace + stojace7dni === aktywne`,
   * `aktywne + nieaktywne === liczbaAut`.
   *
   * Each idle vehicle also lands in `stojaceList` with `daysIdle` =
   * floor(days since `lastDroveAt`). `plannerName` comes from the loaded
   * planner relation (else null); `carrierLogin` from the carrier relation.
   */
  private _buildDispatcherStats(
    vehicles: VehicleRow[],
    driverCount: number,
    trailerCount: number,
    nowMs: number,
  ): { stats: DyspozytorFleetStats; stojaceList: DyspozytorStojacyItem[] } {
    let autaAktywne = 0;
    let autaJezdzace = 0;
    let autaStojace7dni = 0;
    let autaNieaktywne = 0;
    const stojaceList: DyspozytorStojacyItem[] = [];

    for (const v of vehicles) {
      if (!v.active) {
        autaNieaktywne += 1;
        continue;
      }
      autaAktywne += 1;
      // No data → assume driving (legacy default at `Code.gs:3736`).
      if (!v.lastDroveAt) {
        autaJezdzace += 1;
        continue;
      }
      const diffMs = nowMs - v.lastDroveAt.getTime();
      if (Number.isFinite(diffMs) && diffMs > DRIVING_RECENCY_MS) {
        autaStojace7dni += 1;
        stojaceList.push({
          plateNumber: v.plateNumber,
          carrierLogin: v.carrier?.login ?? '',
          lastDroveAt: v.lastDroveAt.toISOString(),
          daysIdle: Math.floor(diffMs / (24 * 60 * 60 * 1000)),
          plannerName: v.planner?.name ?? null,
        });
      } else {
        autaJezdzace += 1;
      }
    }

    const stats: DyspozytorFleetStats = {
      liczbaAut: vehicles.length,
      autaAktywne,
      autaJezdzace,
      autaStojace7dni,
      autaNieaktywne,
      liczbaKierowcow: driverCount,
      liczbaNaczep: trailerCount,
    };
    return { stats, stojaceList };
  }

  /**
   * Phase 11 — empty dyspozytor fleet for a dyspozytor with no team assigned.
   * An explicit empty payload (zeroed KPI strip, no rows) — the dyspozytor must
   * never fall through to "all vehicles" when they have no team.
   */
  private _emptyDispatcherFleet(): DyspozytorFleetResponse {
    return {
      vehicles: [],
      drivers: [],
      trailers: [],
      stats: {
        liczbaAut: 0,
        autaAktywne: 0,
        autaJezdzace: 0,
        autaStojace7dni: 0,
        autaNieaktywne: 0,
        liczbaKierowcow: 0,
        liczbaNaczep: 0,
      },
      stojaceList: [],
    };
  }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Slim-list mappers (shared by /fleet/my, /planista, /dyspozytor) ──

function distinctCarrierIds(vehicles: VehicleRow[]): string[] {
  return [...new Set(vehicles.map((v) => v.carrierId))];
}

/**
 * Slim vehicle picker row + the Phase 6.4 additive (non-sensitive) field set
 * that feeds the planista/dyspozytor read-only detail modals
 * (docs/14-design-system.md §6.4.2). HARD EXCLUSION: never map the four rate
 * fields — pricing must not reach planista/dyspozytor. `gpsMobilePhone` keeps
 * its exact (misnamed) name (tracker device ID — quirk #2). `lastDroveAt` is
 * serialised to an ISO datetime (display-only — quirk #11).
 */
function toVehicleListItem(v: VehicleRow): VehicleListItem {
  return {
    id: v.id,
    plateNumber: v.plateNumber,
    active: v.active,
    type: v.type,
    sideNumber: v.sideNumber,
    euro: v.euro,
    certificateL: v.certificateL,
    gps: v.gps,
    gpsMobilePhone: v.gpsMobilePhone,
    fuelCard: v.fuelCard,
    agreement: v.agreement,
    adr: v.adr,
    wasteAllowed: v.wasteAllowed,
    wasteCountries: v.wasteCountries,
    cabotageDe: v.cabotageDe,
    cabotageFr: v.cabotageFr,
    gb: v.gb,
    it: v.it,
    fr: v.fr,
    lastDroveAt: v.lastDroveAt ? v.lastDroveAt.toISOString() : null,
    notes: v.notes,
    // Phase 11 — dispatch Team with roster (additive, non-sensitive — no rates).
    dispatchTeam: v.dispatchTeam,
  };
}

/**
 * Slim driver picker row + the Phase 6.4 additive field set (§6.4.2).
 * EXCLUDED: `bankAccount` (financial-adjacent — kept out of the role panels).
 */
function toDriverListItem(d: DriverRow): DriverListItem {
  return {
    id: d.id,
    firstName: d.firstName,
    lastName: d.lastName,
    phone: d.phone,
    active: d.active,
    licenseExpiry: d.licenseExpiry ? toDateString(d.licenseExpiry) : null,
    phone2: d.phone2,
    email: d.email,
    idDocumentNumber: d.idDocumentNumber,
    adr: d.adr,
    notes: d.notes,
  };
}

/**
 * Slim trailer picker row + the Phase 6.4 additive field set (§6.4.2). No rate
 * fields exist on trailers, so nothing extra to exclude beyond the universal
 * rule. Dimension/capacity values are bare numbers (units live in the modal
 * labels per §6.4.2).
 */
function toTrailerListItem(t: TrailerRow): TrailerListItem {
  return {
    id: t.id,
    plateNumber: t.plateNumber,
    active: t.active,
    trailerTypeId: t.trailerTypeId,
    trailerTypeName: t.trailerType.name,
    belts: t.belts,
    beltsCount: t.beltsCount,
    mats: t.mats,
    matsCount: t.matsCount,
    innerLength: t.innerLength,
    innerWidth: t.innerWidth,
    innerHeight: t.innerHeight,
    capacity: t.capacity,
    airSuspension: t.airSuspension,
    certXl: t.certXl,
    multilock: t.multilock,
    notes: t.notes,
  };
}
