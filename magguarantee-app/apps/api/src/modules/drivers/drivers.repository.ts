import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface DriverRow {
  id: string;
  carrierId: string;
  loginSlug: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  driverLicenseNumber: string | null;
  licenseExpiry: Date | null;
  bankAccount: string | null;
  notes: string | null;
  active: boolean;
  carrier: { id: string; login: string; name: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface DriverListFilters {
  carrierId?: string;
  active?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}

@Injectable()
export class DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DriverRow | null> {
    const row = await this.prisma.client.driver.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async findByLoginSlug(slug: string): Promise<DriverRow | null> {
    const row = await this.prisma.client.driver.findFirst({
      where: { loginSlug: slug },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async existsLoginSlug(slug: string): Promise<boolean> {
    const row = await this.prisma.client.driver.findFirst({
      where: { loginSlug: slug },
      select: { id: true },
    });
    return !!row;
  }

  async list(filters: DriverListFilters): Promise<DriverRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.carrierId) where.carrierId = filters.carrierId;
    if (typeof filters.active === 'boolean') where.active = filters.active;
    if (filters.q) {
      where.OR = [
        { firstName: { contains: filters.q, mode: 'insensitive' } },
        { lastName: { contains: filters.q, mode: 'insensitive' } },
        { loginSlug: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.client.driver.findMany({
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
    phone?: string | null;
    phone2?: string | null;
    email?: string | null;
    driverLicenseNumber?: string | null;
    licenseExpiry?: Date | null;
    bankAccount?: string | null;
    notes?: string | null;
    active?: boolean;
  }): Promise<DriverRow> {
    const row = await this.prisma.client.driver.create({
      data: {
        carrierId: data.carrierId,
        loginSlug: data.loginSlug,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? null,
        phone2: data.phone2 ?? null,
        email: data.email ?? null,
        driverLicenseNumber: data.driverLicenseNumber ?? null,
        licenseExpiry: data.licenseExpiry ?? null,
        bankAccount: data.bankAccount ?? null,
        notes: data.notes ?? null,
        active: data.active ?? true,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: Record<string, unknown>): Promise<DriverRow> {
    const row = await this.prisma.client.driver.update({
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
    await this.prisma.client.driver.delete({ where: { id } });
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
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      phone2: row.phone2,
      email: row.email,
      driverLicenseNumber: row.driverLicenseNumber,
      licenseExpiry: row.licenseExpiry,
      bankAccount: row.bankAccount,
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

interface DriverPrismaShape {
  id: string;
  carrierId: string;
  loginSlug: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  driverLicenseNumber: string | null;
  licenseExpiry: Date | null;
  bankAccount: string | null;
  notes: string | null;
  active: boolean;
  carrier: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
