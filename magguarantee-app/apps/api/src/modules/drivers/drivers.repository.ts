import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the driver repository.
 *
 * `phone` and `driverLicenseNumber` are non-nullable since the phase-2
 * migration. `email` and `licenseExpiry` are non-nullable since
 * phase3_blocks.
 */
export interface DriverRow {
  id: string;
  carrierId: string;
  loginSlug: string;
  firstName: string;
  lastName: string;
  phone: string;
  phone2: string | null;
  // Nullable per phase3_blocks_audit_revert (drivers in PL trucking often
  // don't have email; license may be unknown at registration).
  email: string | null;
  driverLicenseNumber: string;
  licenseExpiry: Date | null;
  notes: string | null;
  active: boolean;
  carrier: { id: string; login: string; name: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface DriverListFilters {
  carrierId?: string;
  /**
   * Phase 5.1 union-scope path (`DriversService._scopeFilters`) — opiekun
   * without an explicit `carrierId` filter sees the union of their owned
   * carriers' drivers. Mirrors the vehicles repo so the single SQL query
   * still narrows by the FK index. `carrierId` (if also set) wins; an empty
   * `carrierIds: []` short-circuits to 0 rows (Postgres can't `IN ()`).
   */
  carrierIds?: string[];
  active?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DriverRow | null> {
    const row = await this.prisma.tx.driver.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async findByLoginSlug(slug: string): Promise<DriverRow | null> {
    const row = await this.prisma.tx.driver.findFirst({
      where: { loginSlug: slug },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async existsLoginSlug(slug: string): Promise<boolean> {
    const row = await this.prisma.tx.driver.findFirst({
      where: { loginSlug: slug },
      select: { id: true },
    });
    return !!row;
  }

  async list(filters: DriverListFilters): Promise<DriverRow[]> {
    const where: Record<string, unknown> = {};
    // `carrierId` and `carrierIds` are both narrowing filters; the service
    // never sends both. If a future caller does, explicit `carrierId` wins.
    if (filters.carrierId) {
      where.carrierId = filters.carrierId;
    } else if (filters.carrierIds) {
      if (filters.carrierIds.length === 0) {
        // Empty union → 0 rows. Postgres rejects `IN ()`, so we short-circuit
        // with an impossible id filter and keep the canonical empty-page shape.
        where.id = '__no_such_driver__';
      } else {
        where.carrierId = { in: filters.carrierIds };
      }
    }
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { firstName: { contains: filters.q, mode: 'insensitive' } },
        { lastName: { contains: filters.q, mode: 'insensitive' } },
        { loginSlug: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.tx.driver.findMany({
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
    loginSlug: string;
    firstName: string;
    lastName: string;
    phone: string;
    phone2?: string | null;
    email?: string | null;
    driverLicenseNumber: string;
    licenseExpiry?: Date | null;
    notes?: string | null;
    active?: boolean;
  }): Promise<DriverRow> {
    const row = await this.prisma.tx.driver.create({
      data: {
        carrierId: data.carrierId,
        loginSlug: data.loginSlug,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        phone2: data.phone2 ?? null,
        email: data.email ?? null,
        driverLicenseNumber: data.driverLicenseNumber,
        licenseExpiry: data.licenseExpiry ?? null,
        notes: data.notes ?? null,
        active: data.active ?? true,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: Record<string, unknown>): Promise<DriverRow> {
    const row = await this.prisma.tx.driver.update({
      where: { id },
      data,
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async setActive(id: string, active: boolean): Promise<DriverRow> {
    return this.update(id, { active });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.tx.driver.delete({ where: { id } });
  }

  /**
   * Hard-deletes a driver row. Phase 4.4 admin-only flow with a `reason`
   * captured upstream into the audit row's metadata. `deleteMany` bypasses
   * the soft-delete extension that rewrites the singular `delete` →
   * soft-delete update; we want a physical row removal here.
   */
  async hardDelete(id: string): Promise<void> {
    await this.prisma.tx.driver.deleteMany({ where: { id } });
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      carrier: {
        select: {
          id: true,
          user: { select: { login: true, name: true } },
        },
      },
    } as const;
  }

  private flatten(row: DriverPrismaShape): DriverRow {
    return {
      id: row.id,
      carrierId: row.carrierId,
      loginSlug: row.loginSlug,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      phone: row.phone ?? '',
      phone2: row.phone2,
      email: row.email,
      driverLicenseNumber: row.driverLicenseNumber ?? '',
      licenseExpiry: row.licenseExpiry,
      notes: row.notes,
      active: row.active,
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
// marks scalars NOT NULL post-phase3_blocks, but Prisma's `query` extension
// widens scalars in the inferred type). The `carrier` field is now
// optional in the wide shape — `findFirst` may surface it as undefined when
// `include: { carrier: ... }` is missing.
interface DriverPrismaShape {
  id: string;
  carrierId: string;
  loginSlug: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  driverLicenseNumber: string | null;
  licenseExpiry: Date | null;
  notes: string | null;
  active: boolean;
  carrier?: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
