import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the trailer repository.
 *
 * `trailerTypeId` is non-nullable since the phase-2 migration
 * (`phase2_required_fields_carrier_driver_trailer`); the joined
 * `trailerType` object is therefore always present on a fresh fetch.
 */
export interface TrailerRow {
  id: string;
  carrierId: string;
  plateNumber: string;
  active: boolean;
  trailerTypeId: string;
  trailerType: {
    id: string;
    name: string;
    shortCode: string | null;
    active: boolean;
  };
  belts: boolean | null;
  beltsCount: number | null;
  mats: boolean | null;
  matsCount: number | null;
  innerLength: number | null;
  innerWidth: number | null;
  innerHeight: number | null;
  capacity: number | null;
  airSuspension: boolean | null;
  certXl: boolean | null;
  multilock: boolean | null;
  notes: string | null;
  carrier: { id: string; login: string; name: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TrailerListFilters {
  carrierId?: string;
  /**
   * Phase 5.1 union-scope path (`TrailersService._scopeFilters`) — opiekun
   * without an explicit `carrierId` filter sees the union of their owned
   * carriers' trailers. Mirrors the vehicles repo so the single SQL query
   * still narrows by the FK index. `carrierId` (if also set) wins; an empty
   * `carrierIds: []` short-circuits to 0 rows (Postgres can't `IN ()`).
   */
  carrierIds?: string[];
  trailerTypeId?: string;
  active?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class TrailersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TrailerRow | null> {
    const row = await this.prisma.tx.trailer.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: TrailerListFilters): Promise<TrailerRow[]> {
    const where: Record<string, unknown> = {};
    // `carrierId` and `carrierIds` are both narrowing filters; the service
    // never sends both. If a future caller does, explicit `carrierId` wins.
    if (filters.carrierId) {
      where.carrierId = filters.carrierId;
    } else if (filters.carrierIds) {
      if (filters.carrierIds.length === 0) {
        // Empty union → 0 rows. Postgres rejects `IN ()`, so we short-circuit
        // with an impossible id filter and keep the canonical empty-page shape.
        where.id = '__no_such_trailer__';
      } else {
        where.carrierId = { in: filters.carrierIds };
      }
    }
    if (filters.trailerTypeId) where.trailerTypeId = filters.trailerTypeId;
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { plateNumber: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.tx.trailer.findMany({
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

  async create(data: {
    carrierId: string;
    plateNumber: string;
    active?: boolean;
    trailerTypeId: string;
    belts?: boolean | null;
    beltsCount?: number | null;
    mats?: boolean | null;
    matsCount?: number | null;
    innerLength?: number | null;
    innerWidth?: number | null;
    innerHeight?: number | null;
    capacity?: number | null;
    airSuspension?: boolean | null;
    certXl?: boolean | null;
    multilock?: boolean | null;
    notes?: string | null;
  }): Promise<TrailerRow> {
    const row = await this.prisma.tx.trailer.create({
      data: {
        carrierId: data.carrierId,
        plateNumber: data.plateNumber,
        active: data.active ?? true,
        trailerTypeId: data.trailerTypeId,
        belts: data.belts ?? null,
        beltsCount: data.beltsCount ?? null,
        mats: data.mats ?? null,
        matsCount: data.matsCount ?? null,
        innerLength: data.innerLength ?? null,
        innerWidth: data.innerWidth ?? null,
        innerHeight: data.innerHeight ?? null,
        capacity: data.capacity ?? null,
        airSuspension: data.airSuspension ?? null,
        certXl: data.certXl ?? null,
        multilock: data.multilock ?? null,
        notes: data.notes ?? null,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: Record<string, unknown>): Promise<TrailerRow> {
    const row = await this.prisma.tx.trailer.update({
      where: { id },
      data,
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async setActive(id: string, active: boolean): Promise<TrailerRow> {
    return this.update(id, { active });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.tx.trailer.delete({ where: { id } });
  }

  /**
   * Hard-deletes a trailer row. Phase 4.4 admin-only flow with a `reason`
   * captured upstream into the audit row's metadata. `deleteMany` bypasses
   * the soft-delete extension that rewrites the singular `delete` →
   * soft-delete update; we want a physical row removal here.
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.trailer.deleteMany({ where: { id } });
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      trailerType: {
        select: { id: true, name: true, shortCode: true, active: true },
      },
      carrier: {
        select: {
          id: true,
          user: { select: { login: true, name: true } },
        },
      },
    } as const;
  }

  private flatten(row: TrailerPrismaShape): TrailerRow {
    return {
      id: row.id,
      carrierId: row.carrierId,
      plateNumber: row.plateNumber,
      active: row.active,
      trailerTypeId: row.trailerTypeId ?? '',
      trailerType: row.trailerType ?? {
        id: row.trailerTypeId ?? '',
        name: '',
        shortCode: null,
        active: false,
      },
      belts: row.belts,
      beltsCount: row.beltsCount,
      mats: row.mats,
      matsCount: row.matsCount,
      innerLength: decimalToNumber(row.innerLength),
      innerWidth: decimalToNumber(row.innerWidth),
      innerHeight: decimalToNumber(row.innerHeight),
      capacity: decimalToNumber(row.capacity),
      airSuspension: row.airSuspension,
      certXl: row.certXl,
      multilock: row.multilock,
      notes: row.notes,
      carrier: row.carrier
        ? {
            id: row.carrier.id,
            login: row.carrier.user.login,
            name: row.carrier.user.name,
          }
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

// Wide variant of the Prisma row to absorb the inferred-nullable shape
// produced by the soft-delete extension's typing (the underlying schema
// marks `trailerTypeId` NOT NULL post-Phase 2, but Prisma's `query`
// extension still widens the inferred row).
interface TrailerPrismaShape {
  id: string;
  carrierId: string;
  plateNumber: string;
  active: boolean;
  trailerTypeId: string | null;
  trailerType: {
    id: string;
    name: string;
    shortCode: string | null;
    active: boolean;
  } | null;
  belts: boolean | null;
  beltsCount: number | null;
  mats: boolean | null;
  matsCount: number | null;
  innerLength: { toNumber(): number } | number | null;
  innerWidth: { toNumber(): number } | number | null;
  innerHeight: { toNumber(): number } | number | null;
  capacity: { toNumber(): number } | number | null;
  airSuspension: boolean | null;
  certXl: boolean | null;
  multilock: boolean | null;
  notes: string | null;
  carrier: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
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
