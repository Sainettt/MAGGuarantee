import { Injectable } from '@nestjs/common';

import type { DelegationStatus } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the delegations repository.
 *
 * Post-`20260518113943_delegation_required_fields_and_date_only` the
 * following columns are NOT NULL:
 *   - `trailerId`, `driverId`
 *   - `departureCountry`, `departurePostalCode`
 *   - `plannedReturnAt` (date-only), `returnCountry`, `returnPostalCode`
 *
 * `actualReturnAt` stays nullable — it is only set on transition to
 * `zjechal`. The legacy `delegation_returned_complete` CHECK has been
 * dropped; api enforces the `actualReturnAt`/status pairing.
 */
export interface DelegationRow {
  id: string;
  vehicleId: string;
  vehicle: { id: string; plateNumber: string } | null;
  trailerId: string;
  trailer: { id: string; plateNumber: string } | null;
  driverId: string;
  driver: { id: string; firstName: string; lastName: string } | null;
  carrierId: string;
  carrier: { id: string; login: string; name: string | null } | null;

  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;

  departureAt: Date;
  departureCountry: string;
  departurePostalCode: string;

  // Required at submit; `plannedReturnAt` is date-only (Prisma returns a
  // `Date` whose UTC midnight matches the stored `@db.Date` value).
  plannedReturnAt: Date;
  returnCountry: string;
  returnPostalCode: string;

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
  /** REQUIRED post-migration. */
  trailerId: string;
  /** REQUIRED post-migration. */
  driverId: string;
  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;
  departureAt: Date;
  /** REQUIRED post-migration. */
  departureCountry: string;
  departurePostalCode: string;
  /** REQUIRED post-migration — date-only. */
  plannedReturnAt: Date;
  returnCountry: string;
  returnPostalCode: string;
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
      vehicle: row.vehicle ?? null,
      trailerId: row.trailerId,
      trailer: row.trailer ?? null,
      driverId: row.driverId,
      driver: row.driver ?? null,
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
      reportedBy: row.reportedBy ?? null,
      reportedAt: row.reportedAt,
      verifiedById: row.verifiedById,
      verifiedBy: row.verifiedBy ?? null,
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
  vehicle?: { id: string; plateNumber: string } | null;
  trailerId: string;
  trailer?: { id: string; plateNumber: string } | null;
  driverId: string;
  driver?: { id: string; firstName: string; lastName: string } | null;
  carrierId: string;
  carrier?: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;
  departureAt: Date;
  departureCountry: string;
  departurePostalCode: string;
  plannedReturnAt: Date;
  returnCountry: string;
  returnPostalCode: string;
  status: DelegationStatus;
  actualReturnAt: Date | null;
  reportedById: string | null;
  reportedBy?: { id: string; login: string; name: string | null } | null;
  reportedAt: Date;
  verifiedById: string | null;
  verifiedBy?: { id: string; login: string; name: string | null } | null;
  verifiedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
