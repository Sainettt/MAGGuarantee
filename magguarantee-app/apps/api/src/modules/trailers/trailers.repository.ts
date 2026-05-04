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
  brand: string | null;
  model: string | null;
  year: number | null;
  equipment: string | null;
  nextInspectionDate: Date | null;
  belts: boolean | null;
  mats: boolean | null;
  innerLength: number | null;
  innerWidth: number | null;
  innerHeight: number | null;
  capacity: number | null;
  airSuspension: boolean | null;
  loadFromBack: boolean | null;
  loadFromSide: boolean | null;
  loadFromTop: boolean | null;
  slidingRoof: boolean | null;
  edschaSlidingRoof: boolean | null;
  notes: string | null;
  carrier: { id: string; login: string; name: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TrailerListFilters {
  carrierId?: string;
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
    const row = await this.prisma.client.trailer.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: TrailerListFilters): Promise<TrailerRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.carrierId) where.carrierId = filters.carrierId;
    if (filters.trailerTypeId) where.trailerTypeId = filters.trailerTypeId;
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { plateNumber: { contains: filters.q, mode: 'insensitive' } },
        { brand: { contains: filters.q, mode: 'insensitive' } },
        { model: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.client.trailer.findMany({
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
    brand?: string | null;
    model?: string | null;
    year?: number | null;
    equipment?: string | null;
    nextInspectionDate?: Date | null;
    belts?: boolean | null;
    mats?: boolean | null;
    innerLength?: number | null;
    innerWidth?: number | null;
    innerHeight?: number | null;
    capacity?: number | null;
    airSuspension?: boolean | null;
    loadFromBack?: boolean | null;
    loadFromSide?: boolean | null;
    loadFromTop?: boolean | null;
    slidingRoof?: boolean | null;
    edschaSlidingRoof?: boolean | null;
    notes?: string | null;
  }): Promise<TrailerRow> {
    const row = await this.prisma.client.trailer.create({
      data: {
        carrierId: data.carrierId,
        plateNumber: data.plateNumber,
        active: data.active ?? true,
        trailerTypeId: data.trailerTypeId,
        brand: data.brand ?? null,
        model: data.model ?? null,
        year: data.year ?? null,
        equipment: data.equipment ?? null,
        nextInspectionDate: data.nextInspectionDate ?? null,
        belts: data.belts ?? null,
        mats: data.mats ?? null,
        innerLength: data.innerLength ?? null,
        innerWidth: data.innerWidth ?? null,
        innerHeight: data.innerHeight ?? null,
        capacity: data.capacity ?? null,
        airSuspension: data.airSuspension ?? null,
        loadFromBack: data.loadFromBack ?? null,
        loadFromSide: data.loadFromSide ?? null,
        loadFromTop: data.loadFromTop ?? null,
        slidingRoof: data.slidingRoof ?? null,
        edschaSlidingRoof: data.edschaSlidingRoof ?? null,
        notes: data.notes ?? null,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: Record<string, unknown>): Promise<TrailerRow> {
    const row = await this.prisma.client.trailer.update({
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
    await this.prisma.client.trailer.delete({ where: { id } });
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
      trailerTypeId: row.trailerTypeId,
      trailerType: row.trailerType,
      brand: row.brand,
      model: row.model,
      year: row.year,
      equipment: row.equipment,
      nextInspectionDate: row.nextInspectionDate,
      belts: row.belts,
      mats: row.mats,
      innerLength: decimalToNumber(row.innerLength),
      innerWidth: decimalToNumber(row.innerWidth),
      innerHeight: decimalToNumber(row.innerHeight),
      capacity: decimalToNumber(row.capacity),
      airSuspension: row.airSuspension,
      loadFromBack: row.loadFromBack,
      loadFromSide: row.loadFromSide,
      loadFromTop: row.loadFromTop,
      slidingRoof: row.slidingRoof,
      edschaSlidingRoof: row.edschaSlidingRoof,
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

interface TrailerPrismaShape {
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
  brand: string | null;
  model: string | null;
  year: number | null;
  equipment: string | null;
  nextInspectionDate: Date | null;
  belts: boolean | null;
  mats: boolean | null;
  innerLength: { toNumber(): number } | number | null;
  innerWidth: { toNumber(): number } | number | null;
  innerHeight: { toNumber(): number } | number | null;
  capacity: { toNumber(): number } | number | null;
  airSuspension: boolean | null;
  loadFromBack: boolean | null;
  loadFromSide: boolean | null;
  loadFromTop: boolean | null;
  slidingRoof: boolean | null;
  edschaSlidingRoof: boolean | null;
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
