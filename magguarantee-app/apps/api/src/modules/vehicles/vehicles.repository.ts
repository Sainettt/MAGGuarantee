import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the vehicle repository.
 *
 * `certificateL`, `euro`, `type`, `rateDe`, `rateUe`, `rateExport`, `rateImport`
 * are NOT NULL since phase3_blocks. `certificateL` was collapsed from enum
 * `CertificateL { L1 | L2 | L3 }` to Boolean (TAK/NIE) in
 * 20260515130307_vehicle_certificate_l_to_boolean. `gpsMobilePhone` stays
 * nullable per Revert #2 (required iff `gps=true` — enforced by SQL CHECK
 * constraint `vehicle_gps_device_when_gps_on`).
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
  euro: 'III' | 'IV' | 'V' | 'VI';
  adrClasses: string[];
  gps: boolean;
  fuelCard: boolean;
  type: 'MEGA' | 'STD' | 'COIL';
  gb: boolean | null;
  it: boolean | null;
  fr: boolean | null;
  agreement: boolean | null;
  contract: boolean | null;
  // Nullable per phase3_blocks_audit_revert (rates negotiated post-creation).
  rateDe: number | null;
  rateUe: number | null;
  rateExport: number | null;
  rateImport: number | null;
  wasteAllowed: boolean;
  wasteCountries: string[];
  cabotageDe: boolean;
  cabotageFr: boolean;
  gpsMobilePhone: string | null;
  nextInspectionDate: Date | null;
  sideNumber: string | null;
  lastDroveAt: Date | null;
  plannerId: string | null;
  planner: { id: string; login: string; name: string | null } | null;
  dispatcherId: string | null;
  dispatcher: { id: string; login: string; name: string | null } | null;
  carrier: { id: string; login: string; name: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface VehicleListFilters {
  carrierId?: string;
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
    const row = await this.prisma.client.vehicle.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: VehicleListFilters): Promise<VehicleRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.carrierId) where.carrierId = filters.carrierId;
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
    const rows = await this.prisma.client.vehicle.findMany({
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
    plannerId?: string | null;
    dispatcherId?: string | null;
    brand?: string | null;
    model?: string | null;
    year?: number | null;
    notes?: string | null;
    certificateL: boolean;
    euro: 'III' | 'IV' | 'V' | 'VI';
    adrClasses?: string[];
    gps?: boolean;
    fuelCard?: boolean;
    type: 'MEGA' | 'STD' | 'COIL';
    gb?: boolean | null;
    it?: boolean | null;
    fr?: boolean | null;
    agreement?: boolean | null;
    contract?: boolean | null;
    rateDe?: number | null;
    rateUe?: number | null;
    rateExport?: number | null;
    rateImport?: number | null;
    wasteAllowed?: boolean;
    wasteCountries?: string[];
    cabotageDe?: boolean;
    cabotageFr?: boolean;
    /**
     * Nullable per Revert #2 — required iff `gps=true`. The CHECK constraint
     * `vehicle_gps_device_when_gps_on` rejects mismatches at the DB level;
     * the service layer pre-validates so we 422 instead of 500.
     */
    gpsMobilePhone?: string | null;
    nextInspectionDate?: Date | null;
    sideNumber?: string | null;
    createdById?: string | null;
  }): Promise<VehicleRow> {
    const row = await this.prisma.client.vehicle.create({
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
        adrClasses: data.adrClasses ?? [],
        gps: data.gps ?? false,
        fuelCard: data.fuelCard ?? false,
        type: data.type,
        gb: data.gb ?? null,
        it: data.it ?? null,
        fr: data.fr ?? null,
        agreement: data.agreement ?? null,
        contract: data.contract ?? null,
        rateDe: data.rateDe,
        rateUe: data.rateUe,
        rateExport: data.rateExport,
        rateImport: data.rateImport,
        wasteAllowed: data.wasteAllowed ?? false,
        wasteCountries: data.wasteCountries ?? [],
        cabotageDe: data.cabotageDe ?? false,
        cabotageFr: data.cabotageFr ?? false,
        gpsMobilePhone: data.gpsMobilePhone ?? null,
        nextInspectionDate: data.nextInspectionDate ?? null,
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
    const row = await this.prisma.client.vehicle.update({
      where: { id },
      data,
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async setActive(id: string, active: boolean): Promise<VehicleRow> {
    const row = await this.prisma.client.vehicle.update({
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
    await this.prisma.client.vehicle.delete({ where: { id } });
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
      adrClasses: row.adrClasses,
      gps: row.gps,
      fuelCard: row.fuelCard,
      type: row.type ?? 'STD',
      gb: row.gb,
      it: row.it,
      fr: row.fr,
      agreement: row.agreement,
      contract: row.contract,
      rateDe: decimalToNumber(row.rateDe),
      rateUe: decimalToNumber(row.rateUe),
      rateExport: decimalToNumber(row.rateExport),
      rateImport: decimalToNumber(row.rateImport),
      wasteAllowed: row.wasteAllowed,
      wasteCountries: row.wasteCountries,
      cabotageDe: row.cabotageDe,
      cabotageFr: row.cabotageFr,
      gpsMobilePhone: row.gpsMobilePhone,
      nextInspectionDate: row.nextInspectionDate,
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
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
  euro: 'III' | 'IV' | 'V' | 'VI' | null;
  adrClasses: string[];
  gps: boolean;
  fuelCard: boolean;
  type: 'MEGA' | 'STD' | 'COIL' | null;
  gb: boolean | null;
  it: boolean | null;
  fr: boolean | null;
  agreement: boolean | null;
  contract: boolean | null;
  rateDe: { toNumber(): number } | number | null;
  rateUe: { toNumber(): number } | number | null;
  rateExport: { toNumber(): number } | number | null;
  rateImport: { toNumber(): number } | number | null;
  wasteAllowed: boolean;
  wasteCountries: string[];
  cabotageDe: boolean;
  cabotageFr: boolean;
  gpsMobilePhone: string | null;
  nextInspectionDate: Date | null;
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
