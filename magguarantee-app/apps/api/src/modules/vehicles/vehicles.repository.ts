import { Injectable } from '@nestjs/common';

import type {
  VehicleAttachmentCategory,
  VehicleDispatchTeamDto,
} from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Attachment metadata as included on a Vehicle row. `storageKey` is carried
 * through so the service can drive the download proxy / rollback; it is
 * stripped at the DTO boundary (never returned to clients).
 */
export interface VehicleRowAttachment {
  id: string;
  vehicleId: string;
  category: VehicleAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
}

/**
 * Row shape returned by the vehicle repository.
 *
 * `certificateL`, `euro`, `type` are NOT NULL since phase3_blocks.
 * `certificateL` was collapsed from enum `CertificateL { L1 | L2 | L3 }` to
 * Boolean (TAK/NIE) in 20260515130307_vehicle_certificate_l_to_boolean. The
 * legacy `contract` boolean was dropped 2026-05 — the umowa is now a
 * `VehicleAttachment` (category=contract). `euro` is restricted to `V`/`VI`
 * (legacy III/IV removed from `enum EuroNorm`). `gpsMobilePhone` is NOT NULL
 * since the 2026-06-17 migration `drop_vehicle_gps_toggle_require_gps_device`
 * — every vehicle is GPS-tracked, so the device id is always present; the
 * legacy `gps` boolean toggle and the `vehicle_gps_device_when_gps_on` CHECK
 * were dropped together.
 */
export interface VehicleRow {
  id: string;
  carrierId: string;
  plateNumber: string;
  active: boolean;
  notes: string | null;
  certificateL: boolean;
  euro: 'V' | 'VI';
  fuelCard: boolean;
  type: 'MEGA' | 'STD' | 'COIL';
  gb: boolean | null;
  it: boolean | null;
  fr: boolean | null;
  agreement: boolean | null;
  // Nullable per phase3_blocks_audit_revert (rates negotiated post-creation).
  rateDe: number | null;
  rateUe: number | null;
  rateExport: number | null;
  rateImport: number | null;
  wasteAllowed: boolean;
  wasteCountries: string[];
  cabotageDe: boolean;
  cabotageFr: boolean;
  adr: boolean;
  gpsMobilePhone: string;
  sideNumber: string | null;
  lastDroveAt: Date | null;
  plannerId: string | null;
  planner: { id: string; login: string; name: string | null } | null;
  // Phase 11 — dispatch Team FK + the team with its dispatcher roster
  // (replaces the single `dispatcherId`/`dispatcher`).
  dispatchTeamId: string | null;
  dispatchTeam: VehicleDispatchTeamDto | null;
  carrier: { id: string; login: string; name: string | null } | null;
  /** Carrier's opiekun (`Carrier.opiekun`, a `User`) resolved via `carrier.opiekun`. Non-sensitive; additive. */
  opiekun: { id: string; login: string; name: string | null } | null;
  /** Non-deleted umowa/cabotage/adr attachments (soft-delete extension filters). */
  attachments: VehicleRowAttachment[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Lean per-vehicle projection for the weryfikator km-board / km-report. Carries
 * only the columns the board renders — the day-cells are joined in by the
 * service from `VehicleDailyKmRepository.listForWeek`.
 */
export interface VehicleBoardRow {
  id: string;
  plateNumber: string;
  sideNumber: string | null;
  /**
   * The carrier itself (`Vehicle.carrier`). `id` is `Carrier.id`; `name` is
   * the carrier's display name (`carrier.user.name`), nullable only because
   * `User.name` is. Re-added alongside `opiekun` (owner correction 2026-06-10
   * #3 — the board shows BOTH, not either/or).
   */
  carrier: { id: string; name: string | null } | null;
  /**
   * The carrier's opiekun (`Vehicle.carrier.opiekun`, a `User`). The relation
   * `Carrier.opiekunId → User` is NOT NULL, so this is effectively always
   * present; `name` is nullable only because `User.name` is.
   */
  opiekun: { id: string; name: string | null } | null;
  plannerName: string | null;
  /**
   * `Vehicle.createdAt` — surfaced on the board DTO so the monthly-km modal can
   * bound its lower selectable month. Read-only, purely additive.
   */
  createdAt: Date;
}

/**
 * Vehicle scope for the km-board / km-report active-vehicle query
 * (`listActiveForBoard`). All fields optional and AND-composed; an absent
 * field means "no narrowing on that axis":
 *  - `plannerId` — planista km-report (unchanged).
 *  - `dispatchTeamId` — dyspozytor km-report (Phase 11 — the dyspozytor's TEAM,
 *    resolved from the JWT `teamId`; a dyspozytor with NO team → see below).
 *  - `carrierId` — single carrier (przewoznik km-report, resolved from the JWT).
 *  - `carrierIds` — a SET of carriers (opiekun km-report, the supervised set).
 *    IMPORTANT: an EMPTY `carrierIds` array means "0 carriers" → 0 rows, and
 *    must NOT degrade into "no filter" (see `listActiveForBoard`).
 *  - `dispatchTeamId === NO_TEAM_SENTINEL` — the dyspozytor-without-team case:
 *    forces 0 rows (Postgres can't match the sentinel id), mirroring the empty
 *    `carrierIds` posture. Use {@link NO_TEAM_SENTINEL} from this module.
 */
export interface VehicleBoardScope {
  plannerId?: string;
  dispatchTeamId?: string;
  carrierId?: string;
  carrierIds?: string[];
}

export interface VehicleListFilters {
  carrierId?: string;
  /**
   * Restrict to vehicles whose `carrierId` is in this set. Used by the
   * opiekun-scoped list path (`VehiclesService._scopeFilters`) — opiekun
   * without an explicit `carrierId` filter sees the union of their owned
   * carriers' vehicles. Stays repo-side so the single SQL query the list
   * route fires still narrows by the FK index instead of fetching all rows
   * and filtering client-side. Composes with `carrierId` (both apply); the
   * service intersects before calling so an empty `in:` set returns 0 rows.
   */
  carrierIds?: string[];
  plannerId?: string;
  /**
   * Phase 11 — filter to a single dispatch Team (`Vehicle.dispatchTeamId`).
   * Replaces the legacy `dispatcherId` filter. The dyspozytor-without-team case
   * passes {@link NO_TEAM_SENTINEL} so the SQL matches zero rows (an explicit
   * empty set, never "all").
   */
  dispatchTeamId?: string;
  active?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}

/**
 * Impossible team id used to force "0 rows" for a dyspozytor that has no team.
 * Mirrors the `__no_such_vehicle__` empty-`IN()` short-circuit posture: an
 * unassigned dyspozytor must see an EMPTY fleet, never the whole fleet.
 */
export const NO_TEAM_SENTINEL = '__no_dispatch_team__';

@Injectable()
export class VehiclesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<VehicleRow | null> {
    const row = await this.prisma.tx.vehicle.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: VehicleListFilters): Promise<VehicleRow[]> {
    const where: Record<string, unknown> = {};
    // `carrierId` and `carrierIds` are both narrowing filters; the service
    // never sends both (if `carrierId` is in the opiekun's set it forwards
    // only `carrierId` for the FK-index path). If a future caller does send
    // both, the explicit `carrierId` wins — the union set is a default-scope
    // hint, not a hard restriction at the repo level.
    if (filters.carrierId) {
      where.carrierId = filters.carrierId;
    } else if (filters.carrierIds) {
      if (filters.carrierIds.length === 0) {
        // Empty union → 0 rows. Prisma rejects `IN ()` at the SQL layer
        // (Postgres won't accept an empty list); we short-circuit with an
        // impossible id filter so the route still returns the canonical
        // `{ items: [], nextCursor: null }` shape with one cheap query.
        where.id = '__no_such_vehicle__';
      } else {
        where.carrierId = { in: filters.carrierIds };
      }
    }
    if (filters.plannerId) where.plannerId = filters.plannerId;
    if (filters.dispatchTeamId) where.dispatchTeamId = filters.dispatchTeamId;
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { plateNumber: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.tx.vehicle.findMany({
      where,
      include: this.includeShape(),
      orderBy: { createdAt: 'desc' },
      take: filters.limit + 1,
      ...(filters.cursor
        ? { skip: 1, cursor: { id: filters.cursor } }
        : {}),
    });
    return rows.map((r) => this.flatten(r));
  }

  /**
   * Lean projection of every ACTIVE, non-soft-deleted vehicle for the
   * weryfikator km-board (`GET /vehicles/km-board`) and the scoped km-report
   * (`GET /vehicles/km-report`). The soft-delete extension AND-s
   * `deletedAt: null`; we add `active: true` explicitly so deactivated trucks
   * never appear. Only the columns the board renders are selected (no
   * attachments / rates / GPS device) — keeps the query cheap.
   *
   * The optional `scope` narrows by `plannerId` (planista km-report),
   * `dispatchTeamId` (dyspozytor km-report — Phase 11), `carrierId` (przewoznik km-report —
   * their OWN carrier, resolved server-side from the JWT) or `carrierIds` (the
   * opiekun km-report — the set of carriers they supervise). The board
   * (weryfikator/admin) and the eksport/admin report pass no scope and see all
   * active vehicles. An EMPTY `carrierIds` set (opiekun supervising nobody)
   * returns 0 rows — it must never degrade into "no filter" (mirrors the
   * `list()` empty-union short-circuit).
   *
   * The row shows BOTH the carrier itself (`carrier`, `{ id, name }` where
   * `name` is `carrier.user.name`) AND the carrier's OPIEKUN (`carrier.opiekun`,
   * a `User`) — owner correction 2026-06-10 #3, see
   * docs/20-phase-7-eksport-weryfikator.md §0′. The `Carrier.opiekunId → User`
   * relation is NOT NULL, so every active vehicle resolves an opiekun.
   * `planner` is projected to its display NAME.
   */
  async listActiveForBoard(
    scope?: VehicleBoardScope,
  ): Promise<VehicleBoardRow[]> {
    const where: Record<string, unknown> = { active: true };
    if (scope?.plannerId) where.plannerId = scope.plannerId;
    // Phase 11 — dyspozytor km-report scopes by TEAM. NO_TEAM_SENTINEL (the
    // dyspozytor-without-team case) is an impossible id → 0 rows, never "all".
    if (scope?.dispatchTeamId) where.dispatchTeamId = scope.dispatchTeamId;
    // Carrier scoping (przewoznik → own; opiekun → supervised set). The
    // explicit single `carrierId` (if both somehow present) wins; otherwise an
    // `in:` over the set. An EMPTY set must yield 0 rows — Postgres rejects
    // `IN ()`, so we short-circuit with an impossible id (same posture as
    // `list()`), guaranteeing the empty-supervision opiekun gets an empty board
    // rather than the whole fleet.
    if (scope?.carrierId) {
      where.carrierId = scope.carrierId;
    } else if (scope?.carrierIds) {
      where.carrierId =
        scope.carrierIds.length === 0
          ? '__no_such_vehicle__'
          : { in: scope.carrierIds };
    }
    const rows = await this.prisma.tx.vehicle.findMany({
      where,
      select: {
        id: true,
        plateNumber: true,
        sideNumber: true,
        createdAt: true,
        carrier: {
          select: {
            id: true,
            user: { select: { name: true } },
            opiekun: { select: { id: true, name: true } },
          },
        },
        planner: { select: { name: true } },
      },
      orderBy: { plateNumber: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      plateNumber: r.plateNumber,
      sideNumber: r.sideNumber,
      carrier: r.carrier
        ? { id: r.carrier.id, name: r.carrier.user?.name ?? null }
        : null,
      opiekun: r.carrier?.opiekun
        ? { id: r.carrier.opiekun.id, name: r.carrier.opiekun.name ?? null }
        : null,
      plannerName: r.planner?.name ?? null,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Counts a single carrier's active, non-soft-deleted vehicles flagged
   * `adr=true`. Used by the carrier-readiness check (`adrDocMissing` rule):
   * if a carrier operates any ADR vehicle they must also hold an active ADR
   * document. A focused `count` keeps the existence check cheap — mirrors the
   * style of `CarrierAttachmentsRepository.countActiveByCategory`. The
   * soft-delete extension constrains the query to live rows, and we add the
   * explicit `active: true` predicate so deactivated vehicles never count.
   */
  async countActiveAdr(carrierId: string): Promise<number> {
    return this.prisma.tx.vehicle.count({
      where: { carrierId, adr: true, active: true },
    });
  }

  /**
   * Batched variant of `countActiveAdr` for a SET of carriers — one
   * `groupBy` round-trip instead of N per-carrier counts. Returns a map of
   * `carrierId → active-ADR-vehicle count`; carriers with zero ADR vehicles
   * are simply absent from the map (callers treat "missing key" as 0). Used
   * by the opiekun fleet aggregate so building `attentionReasons` for the
   * whole carrier list stays O(1) queries, not O(n). Short-circuits on an
   * empty id set (Postgres rejects `IN ()`).
   */
  async countActiveAdrByCarriers(
    carrierIds: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (carrierIds.length === 0) return out;
    const groups = await this.prisma.tx.vehicle.groupBy({
      by: ['carrierId'],
      where: { carrierId: { in: carrierIds }, adr: true, active: true },
      _count: { carrierId: true },
    });
    for (const g of groups) {
      out.set(g.carrierId, g._count.carrierId);
    }
    return out;
  }

  async create(data: {
    carrierId: string;
    plateNumber: string;
    active?: boolean;
    plannerId?: string | null;
    /** Phase 11 — dispatch Team FK (replaces `dispatcherId`). */
    dispatchTeamId?: string | null;
    notes?: string | null;
    certificateL: boolean;
    euro: 'V' | 'VI';
    fuelCard?: boolean;
    type: 'MEGA' | 'STD' | 'COIL';
    gb?: boolean | null;
    it?: boolean | null;
    fr?: boolean | null;
    agreement?: boolean | null;
    rateDe?: number | null;
    rateUe?: number | null;
    rateExport?: number | null;
    rateImport?: number | null;
    wasteAllowed?: boolean;
    wasteCountries?: string[];
    cabotageDe?: boolean;
    cabotageFr?: boolean;
    adr?: boolean;
    /**
     * Tracker device id — REQUIRED (NOT NULL since 2026-06-17). Every vehicle
     * is GPS-tracked; the legacy `gps` toggle and its conditional CHECK were
     * dropped, so there is no cross-field rule to pre-validate anymore.
     */
    gpsMobilePhone: string;
    sideNumber?: string | null;
    createdById?: string | null;
  }): Promise<VehicleRow> {
    const row = await this.prisma.tx.vehicle.create({
      data: {
        carrierId: data.carrierId,
        plateNumber: data.plateNumber,
        active: data.active ?? true,
        plannerId: data.plannerId ?? null,
        dispatchTeamId: data.dispatchTeamId ?? null,
        notes: data.notes ?? null,
        certificateL: data.certificateL,
        euro: data.euro,
        fuelCard: data.fuelCard ?? false,
        type: data.type,
        gb: data.gb ?? null,
        it: data.it ?? null,
        fr: data.fr ?? null,
        agreement: data.agreement ?? null,
        rateDe: data.rateDe,
        rateUe: data.rateUe,
        rateExport: data.rateExport,
        rateImport: data.rateImport,
        wasteAllowed: data.wasteAllowed ?? false,
        wasteCountries: data.wasteCountries ?? [],
        cabotageDe: data.cabotageDe ?? false,
        cabotageFr: data.cabotageFr ?? false,
        adr: data.adr ?? false,
        gpsMobilePhone: data.gpsMobilePhone,
        sideNumber: data.sideNumber ?? null,
        createdById: data.createdById ?? null,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(
    id: string,
    data: Record<string, unknown>,
  ): Promise<VehicleRow> {
    const row = await this.prisma.tx.vehicle.update({
      where: { id },
      data,
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async setActive(id: string, active: boolean): Promise<VehicleRow> {
    const row = await this.prisma.tx.vehicle.update({
      where: { id },
      data: {
        active,
        deactivatedAt: active ? null : new Date(),
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.tx.vehicle.delete({ where: { id } });
  }

  /**
   * Hard-deletes a vehicle row — used only by the create rollback path when a
   * post-insert step fails. Bypasses the soft-delete extension (which
   * rewrites the singular `delete`) via `deleteMany`.
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.vehicle.deleteMany({ where: { id } });
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      planner: { select: { id: true, login: true, name: true } },
      // Phase 11 — the dispatch Team with its dispatcher roster (replaces the
      // single `dispatcher` relation). NON-SENSITIVE — no rates surface here.
      dispatchTeam: {
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          dispatchers: {
            select: { id: true, name: true, login: true },
            orderBy: { login: 'asc' as const },
          },
        },
      },
      carrier: {
        select: {
          id: true,
          user: { select: { login: true, name: true } },
          opiekun: { select: { id: true, login: true, name: true } },
        },
      },
      // The soft-delete extension auto-filters `deletedAt` on the nested
      // read, so this returns live attachments only.
      attachments: { orderBy: { createdAt: 'asc' } },
    } as const;
  }

  private flatten(row: VehiclePrismaShape): VehicleRow {
    return {
      id: row.id,
      carrierId: row.carrierId,
      plateNumber: row.plateNumber,
      active: row.active,
      notes: row.notes,
      // The fallbacks below are defensive sentinels for the soft-delete
      // extension's wider inferred type — never observed at runtime since
      // the column is NOT NULL post-phase3_blocks.
      certificateL: row.certificateL ?? false,
      euro: row.euro ?? 'V',
      fuelCard: row.fuelCard,
      type: row.type ?? 'STD',
      gb: row.gb,
      it: row.it,
      fr: row.fr,
      agreement: row.agreement,
      rateDe: decimalToNumber(row.rateDe),
      rateUe: decimalToNumber(row.rateUe),
      rateExport: decimalToNumber(row.rateExport),
      rateImport: decimalToNumber(row.rateImport),
      wasteAllowed: row.wasteAllowed,
      wasteCountries: row.wasteCountries,
      cabotageDe: row.cabotageDe,
      cabotageFr: row.cabotageFr,
      adr: row.adr,
      gpsMobilePhone: row.gpsMobilePhone,
      sideNumber: row.sideNumber,
      lastDroveAt: row.lastDroveAt,
      plannerId: row.plannerId,
      planner: row.planner ?? null,
      dispatchTeamId: row.dispatchTeamId,
      dispatchTeam: row.dispatchTeam
        ? {
            id: row.dispatchTeam.id,
            code: row.dispatchTeam.code,
            name: row.dispatchTeam.name,
            active: row.dispatchTeam.active,
            dispatchers: (row.dispatchTeam.dispatchers ?? []).map((d) => ({
              id: d.id,
              name: d.name,
              login: d.login,
            })),
          }
        : null,
      carrier: row.carrier
        ? {
            id: row.carrier.id,
            login: row.carrier.user.login,
            name: row.carrier.user.name,
          }
        : null,
      opiekun: row.carrier?.opiekun
        ? {
            id: row.carrier.opiekun.id,
            login: row.carrier.opiekun.login,
            name: row.carrier.opiekun.name,
          }
        : null,
      attachments: (row.attachments ?? []).map((a) => ({
        id: a.id,
        vehicleId: a.vehicleId,
        category: a.category,
        storageKey: a.storageKey,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        uploadedById: a.uploadedById,
        createdAt: a.createdAt,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

interface VehicleAttachmentPrismaShape {
  id: string;
  vehicleId: string;
  category: VehicleAttachmentCategory;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
}

interface VehiclePrismaShape {
  id: string;
  carrierId: string;
  plateNumber: string;
  active: boolean;
  notes: string | null;
  // Wide variants — soft-delete extension widens scalars in the inferred type.
  certificateL: boolean | null;
  euro: 'V' | 'VI' | null;
  fuelCard: boolean;
  type: 'MEGA' | 'STD' | 'COIL' | null;
  gb: boolean | null;
  it: boolean | null;
  fr: boolean | null;
  agreement: boolean | null;
  rateDe: { toNumber(): number } | number | null;
  rateUe: { toNumber(): number } | number | null;
  rateExport: { toNumber(): number } | number | null;
  rateImport: { toNumber(): number } | number | null;
  wasteAllowed: boolean;
  wasteCountries: string[];
  cabotageDe: boolean;
  cabotageFr: boolean;
  adr: boolean;
  gpsMobilePhone: string;
  sideNumber: string | null;
  lastDroveAt: Date | null;
  plannerId: string | null;
  planner?: { id: string; login: string; name: string | null } | null;
  dispatchTeamId: string | null;
  dispatchTeam?: {
    id: string;
    code: string;
    name: string | null;
    active: boolean;
    dispatchers?: { id: string; name: string | null; login: string }[];
  } | null;
  carrier?: {
    id: string;
    user: { login: string; name: string | null };
    opiekun?: { id: string; login: string; name: string | null } | null;
  } | null;
  attachments?: VehicleAttachmentPrismaShape[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function decimalToNumber(
  v: { toNumber(): number } | number | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber(): number }).toNumber();
  }
  return null;
}
