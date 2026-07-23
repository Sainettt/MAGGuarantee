import { ForbiddenException, Injectable } from '@nestjs/common';

import { startOfBusinessTodayUtc } from '@magguarantee/shared';

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
import { VehicleDelegationStatusRepository } from '../vehicles/vehicle-delegation-status.repository';
import { computeVehicleDerivedFlags } from '../vehicles/vehicle-derived-flags';
import {
  EMPTY_DELEGATION_STATUS,
  computeVehicleLifecycle,
  type VehicleLifecycleInfo,
} from '../vehicles/vehicle-lifecycle';
import {
  NO_TEAM_SENTINEL,
  VehiclesRepository,
  type VehicleRow,
} from '../vehicles/vehicles.repository';

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
    // Batched delegation-status lookup — drives the delegation-driven vehicle
    // lifecycle classification (`computeVehicleLifecycle`) across every fleet
    // panel. Shared with the vehicles module (exported from `VehiclesModule`).
    private readonly delegationStatus: VehicleDelegationStatusRepository,
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

    const lifecycle = await this._lifecycleBatch(vehicleRows);
    return {
      vehicles: vehicleRows.map((v) => toVehicleListItem(v, lifecycle.get(v.id))),
      drivers: driverRows.map(toDriverListItem),
      trailers: trailerRows.map(toTrailerListItem),
    };
  }

  /**
   * Phase 5 — per-carrier fleet aggregate for the opiekun dashboard.
   *
   * Mirrors `Code.gs:2733-2820` (`getOpiekunFleet`) but reduced to the
   * payload the new dashboard actually consumes: identity + the delegation-
   * driven vehicle lifecycle buckets (`aktywne`, `stojace`, `nieaktywne`,
   * `doUsuniecia`, `wylaczone`, `potencjalne`). Drivers / trailers / per-vehicle
   * list endpoints already exist as dedicated routes, so we don't duplicate
   * them here.
   *
   * Role gating:
   *  - admin    → no scope filter (every non-soft-deleted carrier).
   *  - opiekun  → `Carrier.opiekunId === user.sub` only. Filtered server-side
   *               (the OpiekunOwnershipGuard is decorator-driven and targets
   *               single-resource lookups, not list-aggregates).
   *  - other    → 403 (defence in depth; `@Roles` on the controller is the
   *               primary gate).
   *
   * Query budget — O(1), not O(n): the carrier aggregate is one round-trip and
   * the active vehicle / trailer / driver counts come for free on the aggregate
   * row (`_count`). Readiness is a PURE derivation of those counts (ADR queries
   * removed with the carrier-level ADR concept, 2026-07) — no extra reads.
   */
  async getOpiekunFleet(user: AuthUser): Promise<OpiekunFleetResponse> {
    this._assertOpiekunOrAdmin(user);
    const rows = await this.carriers.listForOpiekunAggregate(
      user.role === 'opiekun' ? { opiekunId: user.sub } : {},
    );
    const readinessById = this._computeReadinessBatch(rows);
    // ONE batched delegation-status lookup across every vehicle of every carrier
    // in scope → the per-vehicle lifecycle status (no N+1).
    const lifecycle = await this._lifecycleBatch(rows.flatMap((r) => r.vehicles));
    const carriers = rows.map((r) =>
      this._mapCarrierStats(r, lifecycle, readinessById.get(r.id)),
    );
    return {
      carriers,
      totals: this._buildTotals(carriers),
    };
  }

  /**
   * Builds readiness for the whole opiekun-scoped carrier set — PURE, no DB
   * access. The active vehicle/trailer/driver counts are already on the
   * aggregate rows (`_count`), so we just normalise them and hand them to
   * `CarrierReadinessService.forCarriers`. Readiness no longer depends on ADR
   * (carrier-level ADR concept removed 2026-07).
   */
  private _computeReadinessBatch(
    rows: OpiekunAggregateCarrierRow[],
  ): Map<string, CarrierReadiness> {
    const inputsById = new Map(
      rows.map((r) => [
        r.id,
        {
          activeVehicles: r.counts.vehicles,
          activeTrailers: r.counts.trailers,
          activeDrivers: r.counts.drivers,
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
    lifecycle: Map<string, VehicleLifecycleInfo>,
    readiness: CarrierReadiness | undefined,
  ): OpiekunCarrierStats {
    const vehicles = this._classifyVehicles(row, lifecycle);
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
   * Delegation-driven lifecycle classification (Vehicle-status rework). Each
   * LIVE vehicle of the carrier is bucketed by its `computeVehicleLifecycle`
   * status (resolved via the batched `lifecycle` map):
   *   - `aktywne`     — active AND a non-terminal delegation exists.
   *   - `stojace`     — active, no active delegation, idle 0–14 calendar days.
   *   - `nieaktywne`  — …idle 15–28 calendar days.
   *   - `doUsuniecia` — …idle ≥29 calendar days.
   *   - `wylaczone`   — `Vehicle.active=false` (manual deactivation).
   *   - `potencjalne` — `max(0, numberOfVehicle ?? 0 − total)` (KREPTD
   *                     headroom; unchanged).
   *   - `total`       — sum of the five lifecycle buckets (every registered,
   *                     non-soft-deleted vehicle).
   */
  private _classifyVehicles(
    row: OpiekunAggregateCarrierRow,
    lifecycle: Map<string, VehicleLifecycleInfo>,
  ): OpiekunCarrierVehicleStats {
    let aktywne = 0;
    let stojace = 0;
    let nieaktywne = 0;
    let doUsuniecia = 0;
    let wylaczone = 0;
    for (const v of row.vehicles) {
      // The vehicle id is always present in the batch (the lookup keys every
      // requested id); the `?? stojaca` is a defensive default that never fires.
      const status = lifecycle.get(v.id)?.status ?? 'stojaca';
      switch (status) {
        case 'aktywna':
          aktywne += 1;
          break;
        case 'nieaktywna':
          nieaktywne += 1;
          break;
        case 'do_usuniecia':
          doUsuniecia += 1;
          break;
        case 'wylaczona':
          wylaczone += 1;
          break;
        case 'stojaca':
        default:
          stojace += 1;
          break;
      }
    }
    const total = aktywne + stojace + nieaktywne + doUsuniecia + wylaczone;
    const kreptd = row.numberOfVehicle ?? 0;
    const potencjalne = Math.max(0, kreptd - total);
    return {
      aktywne,
      stojace,
      nieaktywne,
      doUsuniecia,
      wylaczone,
      potencjalne,
      total,
    };
  }

  private _buildTotals(rows: OpiekunCarrierStats[]) {
    const zero: OpiekunCarrierVehicleStats = {
      aktywne: 0,
      stojace: 0,
      nieaktywne: 0,
      doUsuniecia: 0,
      wylaczone: 0,
      potencjalne: 0,
      total: 0,
    };
    const vehicles = rows.reduce<OpiekunCarrierVehicleStats>(
      (acc, r) => ({
        aktywne: acc.aktywne + r.vehicles.aktywne,
        stojace: acc.stojace + r.vehicles.stojace,
        nieaktywne: acc.nieaktywne + r.vehicles.nieaktywne,
        doUsuniecia: acc.doUsuniecia + r.vehicles.doUsuniecia,
        wylaczone: acc.wylaczone + r.vehicles.wylaczone,
        potencjalne: acc.potencjalne + r.vehicles.potencjalne,
        total: acc.total + r.vehicles.total,
      }),
      zero,
    );
    return { liczbaPrzewoznikow: rows.length, vehicles };
  }

  /**
   * Batched delegation-status → per-vehicle lifecycle info for any set of
   * vehicle-like rows (full `VehicleRow` from `vehicles.list` OR the slim
   * `{ id, active, createdAt }` shape from the opiekun aggregate). ONE query for
   * the whole set — the single seam every fleet panel routes through so the
   * classification never drifts between them.
   */
  private async _lifecycleBatch(
    rows: Array<{ id: string; active: boolean; createdAt: Date }>,
  ): Promise<Map<string, VehicleLifecycleInfo>> {
    const today = startOfBusinessTodayUtc();
    const out = new Map<string, VehicleLifecycleInfo>();
    if (rows.length === 0) return out;
    const statuses = await this.delegationStatus.getByVehicleIds(
      rows.map((r) => r.id),
    );
    for (const r of rows) {
      const ds = statuses.get(r.id) ?? EMPTY_DELEGATION_STATUS;
      out.set(r.id, computeVehicleLifecycle(r, ds, today));
    }
    return out;
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
   * Phase 6.4 — the planista panel now also surfaces a KPI strip + a
   * needs-attention highlight list, computed over the plannerId-scoped fleet
   * with the SAME `_buildDispatcherStats` helper the dyspozytor uses (identical
   * delegation-driven lifecycle classification), so the two panels stay
   * byte-identical. `stats`/`stojaceList` reuse the dyspozytor shapes.
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
    const lifecycle = await this._lifecycleBatch(vehicleRows);
    const { stats, stojaceList } = this._buildDispatcherStats(
      vehicleRows,
      drivers.length,
      trailers.length,
      lifecycle,
    );
    return {
      vehicles: vehicleRows.map((v) => toVehicleListItem(v, lifecycle.get(v.id))),
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
   *  3. `stats` from the SAME delegation-driven lifecycle classification the
   *     opiekun dashboard uses (`_buildDispatcherStats` +
   *     `computeVehicleLifecycle`), so the buckets stay identical across
   *     opiekun + dyspozytor + planista.
   *  4. `stojaceList` — one row per vehicle needing attention (`nieaktywna` OR
   *     `do_usuniecia`).
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
    const lifecycle = await this._lifecycleBatch(vehicleRows);
    const { stats, stojaceList } = this._buildDispatcherStats(
      vehicleRows,
      drivers.length,
      trailers.length,
      lifecycle,
    );
    return {
      vehicles: vehicleRows.map((v) => toVehicleListItem(v, lifecycle.get(v.id))),
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
   * Dyspozytor/planista KPI stats + "needs attention" list, delegation-driven
   * lifecycle model. Each vehicle is bucketed by its precomputed
   * `computeVehicleLifecycle` status (from `lifecycle`):
   *   - `wylaczone`   — `Vehicle.active=false`.
   *   - `aktywne`     — active AND a non-terminal delegation exists.
   *   - `stojace`     — active, no active delegation, idle 0–14 calendar days.
   *   - `nieaktywne`  — …idle 15–28 calendar days.
   *   - `doUsuniecia` — …idle ≥29 calendar days.
   * Invariant: `aktywne + stojace + nieaktywne + doUsuniecia + wylaczone ===
   * liczbaAut`.
   *
   * `stojaceList` (repurposed) collects the vehicles that need attention —
   * those in `nieaktywna` OR `do_usuniecia` — each with its `daysSinceReturn`
   * and `status`. `plannerName` comes from the loaded planner relation (else
   * null); `carrierLogin` from the carrier relation.
   */
  private _buildDispatcherStats(
    vehicles: VehicleRow[],
    driverCount: number,
    trailerCount: number,
    lifecycle: Map<string, VehicleLifecycleInfo>,
  ): { stats: DyspozytorFleetStats; stojaceList: DyspozytorStojacyItem[] } {
    let aktywne = 0;
    let stojace = 0;
    let nieaktywne = 0;
    let doUsuniecia = 0;
    let wylaczone = 0;
    const stojaceList: DyspozytorStojacyItem[] = [];

    for (const v of vehicles) {
      // Always present (the batch keys every requested id); defensive default.
      const info = lifecycle.get(v.id) ?? {
        status: 'stojaca' as const,
        daysSinceReturn: 0,
      };
      switch (info.status) {
        case 'aktywna':
          aktywne += 1;
          break;
        case 'wylaczona':
          wylaczone += 1;
          break;
        case 'nieaktywna':
        case 'do_usuniecia':
          if (info.status === 'nieaktywna') nieaktywne += 1;
          else doUsuniecia += 1;
          stojaceList.push({
            plateNumber: v.plateNumber,
            carrierLogin: v.carrier?.login ?? '',
            status: info.status,
            daysSinceReturn: info.daysSinceReturn ?? 0,
            plannerName: v.planner?.name ?? null,
          });
          break;
        case 'stojaca':
        default:
          stojace += 1;
          break;
      }
    }

    const stats: DyspozytorFleetStats = {
      liczbaAut: vehicles.length,
      aktywne,
      stojace,
      nieaktywne,
      doUsuniecia,
      wylaczone,
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
      stats: EMPTY_DISPATCHER_STATS,
      stojaceList: [],
    };
  }
}

/** Zeroed dyspozytor/planista KPI strip (empty fleet). */
const EMPTY_DISPATCHER_STATS: DyspozytorFleetStats = {
  liczbaAut: 0,
  aktywne: 0,
  stojace: 0,
  nieaktywne: 0,
  doUsuniecia: 0,
  wylaczone: 0,
  liczbaKierowcow: 0,
  liczbaNaczep: 0,
};

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
 *
 * `lifecycle` carries the DERIVED `lifecycleStatus`/`daysSinceReturn` per-row
 * badge (computed by the caller's `_lifecycleBatch`). When omitted (defensive)
 * it falls back to the no-delegation classification from `active` + `createdAt`.
 */
function toVehicleListItem(
  v: VehicleRow,
  lifecycle?: VehicleLifecycleInfo,
): VehicleListItem {
  const lc =
    lifecycle ??
    computeVehicleLifecycle(v, EMPTY_DELEGATION_STATUS, startOfBusinessTodayUtc());
  return {
    id: v.id,
    plateNumber: v.plateNumber,
    active: v.active,
    type: v.type,
    sideNumber: v.sideNumber,
    euro: v.euro,
    certificateL: v.certificateL,
    gpsMobilePhone: v.gpsMobilePhone,
    fuelCard: v.fuelCard,
    agreement: v.agreement,
    adr: v.adr,
    adrClasses: v.adrClasses as VehicleListItem['adrClasses'],
    wasteAllowed: v.wasteAllowed,
    wasteCountries: v.wasteCountries as VehicleListItem['wasteCountries'],
    cabotageDe: v.cabotageDe,
    cabotageFr: v.cabotageFr,
    gb: v.gb,
    it: v.it,
    fr: v.fr,
    // Derived flags via the SHARED helper (same source as VehiclesService.toDto).
    ...computeVehicleDerivedFlags(v),
    lastDroveAt: v.lastDroveAt ? v.lastDroveAt.toISOString() : null,
    lifecycleStatus: lc.status,
    daysSinceReturn: lc.daysSinceReturn,
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
    nationality: d.nationality,
    languages: d.languages as DriverListItem['languages'],
    adr: d.adr,
    adrClasses: d.adrClasses as DriverListItem['adrClasses'],
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
    beams: t.beams,
    beamsCount: t.beamsCount,
    innerLength: t.innerLength,
    innerWidth: t.innerWidth,
    innerHeight: t.innerHeight,
    capacity: t.capacity,
    sideClearanceCm: t.sideClearanceCm,
    liftingRoof: t.liftingRoof,
    slidingRoof: t.slidingRoof,
    edscha: t.edscha,
    palletBox: t.palletBox,
    certXl: t.certXl,
    multilock: t.multilock,
    notes: t.notes,
  };
}
