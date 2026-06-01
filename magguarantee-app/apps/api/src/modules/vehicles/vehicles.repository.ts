import { Injectable } from '@nestjs/common';

import type { VehicleAttachmentCategory } from '@magguarantee/shared';

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
 * (legacy III/IV removed from `enum EuroNorm`). `gpsMobilePhone` stays
 * nullable (required iff `gps=true` — enforced by SQL CHECK constraint
 * `vehicle_gps_device_when_gps_on`).
 */
export interface VehicleRow {
  id: string;
  carrierId: string;
  plateNumber: string;
  active: boolean;
  brand: string | null;
  model: string | null;
  year: number | null;
  notes: string | null;
  certificateL: boolean;
  euro: 'V' | 'VI';
  gps: boolean;
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
  gpsMobilePhone: string | null;
  sideNumber: string | null;
  lastDroveAt: Date | null;
  plannerId: string | null;
  planner: { id: string; login: string; name: string | null } | null;
  dispatcherId: string | null;
  dispatcher: { id: string; login: string; name: string | null } | null;
  carrier: { id: string; login: string; name: string | null } | null;
  /** Non-deleted umowa/cabotage/adr attachments (soft-delete extension filters). */
  attachments: VehicleRowAttachment[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
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
  dispatcherId?: string;
  active?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}

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
    if (filters.dispatcherId) where.dispatcherId = filters.dispatcherId;
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { plateNumber: { contains: filters.q, mode: 'insensitive' } },
        { brand: { contains: filters.q, mode: 'insensitive' } },
        { model: { contains: filters.q, mode: 'insensitive' } },
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
    dispatcherId?: string | null;
    brand?: string | null;
    model?: string | null;
    year?: number | null;
    notes?: string | null;
    certificateL: boolean;
    euro: 'V' | 'VI';
    gps?: boolean;
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
     * Nullable per Revert #2 — required iff `gps=true`. The CHECK constraint
     * `vehicle_gps_device_when_gps_on` rejects mismatches at the DB level;
     * the service layer pre-validates so we 422 instead of 500.
     */
    gpsMobilePhone?: string | null;
    sideNumber?: string | null;
    createdById?: string | null;
  }): Promise<VehicleRow> {
    const row = await this.prisma.tx.vehicle.create({
      data: {
        carrierId: data.carrierId,
        plateNumber: data.plateNumber,
        active: data.active ?? true,
        plannerId: data.plannerId ?? null,
        dispatcherId: data.dispatcherId ?? null,
        brand: data.brand ?? null,
        model: data.model ?? null,
        year: data.year ?? null,
        notes: data.notes ?? null,
        certificateL: data.certificateL,
        euro: data.euro,
        gps: data.gps ?? false,
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
        gpsMobilePhone: data.gpsMobilePhone ?? null,
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
      dispatcher: { select: { id: true, login: true, name: true } },
      carrier: {
        select: {
          id: true,
          user: { select: { login: true, name: true } },
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
      brand: row.brand,
      model: row.model,
      year: row.year,
      notes: row.notes,
      // The fallbacks below are defensive sentinels for the soft-delete
      // extension's wider inferred type — never observed at runtime since
      // the column is NOT NULL post-phase3_blocks.
      certificateL: row.certificateL ?? false,
      euro: row.euro ?? 'V',
      gps: row.gps,
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
      dispatcherId: row.dispatcherId,
      dispatcher: row.dispatcher ?? null,
      carrier: row.carrier
        ? {
            id: row.carrier.id,
            login: row.carrier.user.login,
            name: row.carrier.user.name,
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
  brand: string | null;
  model: string | null;
  year: number | null;
  notes: string | null;
  // Wide variants — soft-delete extension widens scalars in the inferred type.
  certificateL: boolean | null;
  euro: 'V' | 'VI' | null;
  gps: boolean;
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
  gpsMobilePhone: string | null;
  sideNumber: string | null;
  lastDroveAt: Date | null;
  plannerId: string | null;
  planner?: { id: string; login: string; name: string | null } | null;
  dispatcherId: string | null;
  dispatcher?: { id: string; login: string; name: string | null } | null;
  carrier?: {
    id: string;
    user: { login: string; name: string | null };
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
