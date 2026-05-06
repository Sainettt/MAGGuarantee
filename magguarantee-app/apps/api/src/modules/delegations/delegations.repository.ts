import { Injectable } from '@nestjs/common';

import type { DelegationStatus } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the delegations repository.
 */
export interface DelegationRow {
  id: string;
  vehicleId: string;
  vehicle: { id: string; plateNumber: string } | null;
  trailerId: string | null;
  trailer: { id: string; plateNumber: string } | null;
  driverId: string | null;
  driver: { id: string; firstName: string; lastName: string } | null;
  carrierId: string;
  carrier: { id: string; login: string; name: string | null } | null;

  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;

  departureAt: Date;
  departureCountry: string | null;
  departurePostalCode: string | null;

  plannedReturnAt: Date | null;
  returnCountry: string | null;
  returnPostalCode: string | null;

  status: DelegationStatus;
  actualReturnAt: Date | null;

  reportedById: string | null;
  reportedBy: { id: string; login: string; name: string | null } | null;
  reportedAt: Date;
  verifiedById: string | null;
  verifiedBy: { id: string; login: string; name: string | null } | null;
  verifiedAt: Date | null;

  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface DelegationListFilters {
  status?: DelegationStatus;
  carrierId?: string;
  vehicleId?: string;
  driverId?: string;
  /** ISO datetime — match delegations whose `departureAt` ≥ from. */
  from?: string;
  /** ISO datetime — match delegations whose `departureAt` ≤ to. */
  to?: string;
  q?: string;
  cursor?: string;
  limit: number;
}

export interface CreateDelegationData {
  carrierId: string;
  vehicleId: string;
  trailerId: string | null;
  driverId: string | null;
  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;
  departureAt: Date;
  departureCountry: string | null;
  departurePostalCode: string | null;
  plannedReturnAt: Date | null;
  returnCountry: string | null;
  returnPostalCode: string | null;
  notes: string | null;
  reportedById: string | null;
}

export interface UpdateDelegationData {
  status?: DelegationStatus;
  notes?: string | null;
  actualReturnAt?: Date | null;
}

@Injectable()
export class DelegationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DelegationRow | null> {
    const row = await this.prisma.client.delegation.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: DelegationListFilters): Promise<DelegationRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.carrierId) where.carrierId = filters.carrierId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.driverId) where.driverId = filters.driverId;
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) range.gte = new Date(filters.from);
      if (filters.to) range.lte = new Date(filters.to);
      where.departureAt = range;
    }
    if (filters.q) {
      const q = filters.q;
      where.OR = [
        { departureCountry: { contains: q, mode: 'insensitive' } },
        { returnCountry: { contains: q, mode: 'insensitive' } },
        { driverNameSnapshot: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.client.delegation.findMany({
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

  async create(data: CreateDelegationData): Promise<DelegationRow> {
    const row = await this.prisma.client.delegation.create({
      data: {
        carrierId: data.carrierId,
        vehicleId: data.vehicleId,
        trailerId: data.trailerId,
        driverId: data.driverId,
        driverNameSnapshot: data.driverNameSnapshot,
        driverPhoneSnapshot: data.driverPhoneSnapshot,
        departureAt: data.departureAt,
        departureCountry: data.departureCountry,
        departurePostalCode: data.departurePostalCode,
        plannedReturnAt: data.plannedReturnAt,
        returnCountry: data.returnCountry,
        returnPostalCode: data.returnPostalCode,
        notes: data.notes,
        reportedById: data.reportedById,
        status: 'zgloszony',
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: UpdateDelegationData): Promise<DelegationRow> {
    const row = await this.prisma.client.delegation.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
        actualReturnAt: data.actualReturnAt,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      vehicle: { select: { id: true, plateNumber: true } },
      trailer: { select: { id: true, plateNumber: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
      carrier: {
        select: {
          id: true,
          user: { select: { login: true, name: true } },
        },
      },
      reportedBy: { select: { id: true, login: true, name: true } },
      verifiedBy: { select: { id: true, login: true, name: true } },
    } as const;
  }

  private flatten(row: DelegationPrismaShape): DelegationRow {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      vehicle: row.vehicle,
      trailerId: row.trailerId,
      trailer: row.trailer,
      driverId: row.driverId,
      driver: row.driver,
      carrierId: row.carrierId,
      carrier: row.carrier
        ? {
            id: row.carrier.id,
            login: row.carrier.user.login,
            name: row.carrier.user.name,
          }
        : null,
      driverNameSnapshot: row.driverNameSnapshot,
      driverPhoneSnapshot: row.driverPhoneSnapshot,
      departureAt: row.departureAt,
      departureCountry: row.departureCountry,
      departurePostalCode: row.departurePostalCode,
      plannedReturnAt: row.plannedReturnAt,
      returnCountry: row.returnCountry,
      returnPostalCode: row.returnPostalCode,
      status: row.status,
      actualReturnAt: row.actualReturnAt,
      reportedById: row.reportedById,
      reportedBy: row.reportedBy,
      reportedAt: row.reportedAt,
      verifiedById: row.verifiedById,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

interface DelegationPrismaShape {
  id: string;
  vehicleId: string;
  vehicle: { id: string; plateNumber: string } | null;
  trailerId: string | null;
  trailer: { id: string; plateNumber: string } | null;
  driverId: string | null;
  driver: { id: string; firstName: string; lastName: string } | null;
  carrierId: string;
  carrier: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;
  departureAt: Date;
  departureCountry: string | null;
  departurePostalCode: string | null;
  plannedReturnAt: Date | null;
  returnCountry: string | null;
  returnPostalCode: string | null;
  status: DelegationStatus;
  actualReturnAt: Date | null;
  reportedById: string | null;
  reportedBy: { id: string; login: string; name: string | null } | null;
  reportedAt: Date;
  verifiedById: string | null;
  verifiedBy: { id: string; login: string; name: string | null } | null;
  verifiedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
