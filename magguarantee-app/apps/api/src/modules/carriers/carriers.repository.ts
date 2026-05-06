import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the carrier repository — flattens `user` so the
 * service can map straight to the wire DTO without re-walking the join.
 *
 * `phone` and `opiekunId` are non-nullable since the phase-2 migration
 * (`phase2_required_fields_carrier_driver_trailer`). The `opiekun` join
 * object is therefore always present on a fresh fetch.
 */
export interface CarrierRow {
  id: string;
  userId: string;
  login: string;
  email: string | null;
  name: string | null;
  company: string | null;
  active: boolean;
  nip: string | null;
  vatId: string | null;
  contactPerson: string | null;
  phone: string;
  ordersEmail: string | null;
  accountEur: string | null;
  accountPln: string | null;
  paymentTerms: number | null;
  insuranceValue: number | null;
  insuranceExpiry: Date | null;
  licenseExpiry: Date | null;
  numberOfPermits: number | null;
  companyAddress: string | null;
  opiekunId: string;
  opiekun: {
    id: string;
    login: string;
    name: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CarrierListFilters {
  opiekunId?: string;
  active?: boolean;
  q?: string;
  cursor?: string;
  limit: number;
}

interface CreateCarrierData {
  // user side
  login: string;
  email: string;
  name: string;
  passwordHash: string;
  company?: string | null;
  active?: boolean;
  // carrier-extension side — `phone` and `opiekunId` are NOT NULL.
  nip?: string | null;
  vatId?: string | null;
  contactPerson?: string | null;
  phone: string;
  ordersEmail?: string | null;
  accountEur?: string | null;
  accountPln?: string | null;
  paymentTerms?: number | null;
  insuranceValue?: number | null;
  insuranceExpiry?: Date | null;
  licenseExpiry?: Date | null;
  numberOfPermits?: number | null;
  companyAddress?: string | null;
  opiekunId: string;
}

interface UpdateCarrierData {
  email?: string | null;
  name?: string | null;
  company?: string | null;
  active?: boolean;
  passwordHash?: string;
  nip?: string | null;
  vatId?: string | null;
  contactPerson?: string | null;
  phone?: string;
  ordersEmail?: string | null;
  accountEur?: string | null;
  accountPln?: string | null;
  paymentTerms?: number | null;
  insuranceValue?: number | null;
  insuranceExpiry?: Date | null;
  licenseExpiry?: Date | null;
  numberOfPermits?: number | null;
  companyAddress?: string | null;
  opiekunId?: string;
}

/**
 * Read/write surface for `Carrier` (and the 1:1 `User` shadow). Per
 * docs/04-data-model.md a carrier is always created together with its user
 * row — both inserts share a transaction.
 */
@Injectable()
export class CarriersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CarrierRow | null> {
    const row = await this.prisma.client.carrier.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async findByLogin(login: string): Promise<CarrierRow | null> {
    const row = await this.prisma.client.carrier.findFirst({
      where: { user: { login } },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: CarrierListFilters): Promise<CarrierRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.opiekunId) where.opiekunId = filters.opiekunId;
    if (filters.q) {
      const q = filters.q;
      where.OR = [
        { user: { login: { contains: q, mode: 'insensitive' } } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        { nip: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (typeof filters.active === 'boolean') {
      where.user = {
        ...((where.user as Record<string, unknown>) ?? {}),
        active: filters.active,
      };
    }
    const rows = await this.prisma.client.carrier.findMany({
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

  async create(data: CreateCarrierData): Promise<CarrierRow> {
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          login: data.login,
          email: data.email,
          name: data.name,
          role: 'przewoznik',
          passwordHash: data.passwordHash,
          company: data.company ?? null,
          active: data.active ?? true,
        },
      });
      const carrier = await tx.carrier.create({
        data: {
          userId: user.id,
          nip: data.nip ?? null,
          vatId: data.vatId ?? null,
          contactPerson: data.contactPerson ?? null,
          phone: data.phone,
          ordersEmail: data.ordersEmail ?? null,
          accountEur: data.accountEur ?? null,
          accountPln: data.accountPln ?? null,
          paymentTerms: data.paymentTerms ?? null,
          insuranceValue: data.insuranceValue ?? null,
          insuranceExpiry: data.insuranceExpiry ?? null,
          licenseExpiry: data.licenseExpiry ?? null,
          numberOfPermits: data.numberOfPermits ?? null,
          companyAddress: data.companyAddress ?? null,
          opiekunId: data.opiekunId,
        },
        include: this.includeShape(),
      });
      return carrier;
    });
    return this.flatten(created);
  }

  async update(id: string, data: UpdateCarrierData): Promise<CarrierRow> {
    const userPatch: Record<string, unknown> = {};
    const carrierPatch: Record<string, unknown> = {};

    if (data.email !== undefined) userPatch.email = data.email;
    if (data.name !== undefined) userPatch.name = data.name;
    if (data.company !== undefined) userPatch.company = data.company;
    if (data.active !== undefined) userPatch.active = data.active;
    if (data.passwordHash !== undefined) userPatch.passwordHash = data.passwordHash;

    const carrierFields: (keyof UpdateCarrierData)[] = [
      'nip',
      'vatId',
      'contactPerson',
      'phone',
      'ordersEmail',
      'accountEur',
      'accountPln',
      'paymentTerms',
      'insuranceValue',
      'insuranceExpiry',
      'licenseExpiry',
      'numberOfPermits',
      'companyAddress',
      'opiekunId',
    ];
    for (const k of carrierFields) {
      if (data[k] !== undefined) {
        carrierPatch[k] = data[k];
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const carrier = await tx.carrier.findFirst({ where: { id } });
      if (!carrier) {
        return null;
      }
      if (Object.keys(userPatch).length > 0) {
        await tx.user.update({
          where: { id: carrier.userId },
          data: userPatch,
        });
      }
      const out = await tx.carrier.update({
        where: { id },
        data: carrierPatch,
        include: this.includeShape(),
      });
      return out;
    });
    if (!updated) {
      throw new Error('Carrier disappeared mid-update');
    }
    return this.flatten(updated);
  }

  async setActive(id: string, active: boolean): Promise<CarrierRow> {
    return this.update(id, { active });
  }

  async softDelete(id: string): Promise<void> {
    // Soft-deleting the carrier must cascade-soft-delete its fleet per
    // docs/04-data-model.md#cascade-при-удалении-carrier. We do this in one
    // transaction so the audit row reflects the same atomic moment.
    const carrier = await this.prisma.client.carrier.findFirst({
      where: { id },
    });
    if (!carrier) return;
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.vehicle.updateMany({
        where: { carrierId: id, deletedAt: null },
        data: { deletedAt: now, active: false },
      });
      await tx.driver.updateMany({
        where: { carrierId: id, deletedAt: null },
        data: { deletedAt: now, active: false },
      });
      await tx.trailer.updateMany({
        where: { carrierId: id, deletedAt: null },
        data: { deletedAt: now, active: false },
      });
      await tx.carrier.update({
        where: { id },
        data: { deletedAt: now },
      });
      // Soft-delete the user too so login is blocked.
      await tx.user.update({
        where: { id: carrier.userId },
        data: { deletedAt: now, active: false },
      });
    });
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      user: {
        select: {
          id: true,
          login: true,
          email: true,
          name: true,
          company: true,
          active: true,
        },
      },
      opiekun: {
        select: { id: true, login: true, name: true },
      },
    } as const;
  }

  private flatten(row: {
    id: string;
    userId: string;
    nip: string | null;
    vatId: string | null;
    contactPerson: string | null;
    // Prisma's inferred type from `findFirst({include: ...})` post the soft-
    // delete extension surfaces the scalar column as `string | null`, even
    // though the schema marks it NOT NULL. We accept the wider shape here
    // and fall back to `''` defensively — never observed in practice since
    // the migration backfills.
    phone: string | null;
    ordersEmail: string | null;
    accountEur: string | null;
    accountPln: string | null;
    paymentTerms: number | null;
    insuranceValue: { toNumber(): number } | null;
    insuranceExpiry: Date | null;
    licenseExpiry: Date | null;
    numberOfPermits: number | null;
    companyAddress: string | null;
    opiekunId: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    user: {
      id: string;
      login: string;
      email: string | null;
      name: string | null;
      company: string | null;
      active: boolean;
    };
    opiekun: { id: string; login: string; name: string | null } | null;
  }): CarrierRow {
    return {
      id: row.id,
      userId: row.userId,
      login: row.user.login,
      email: row.user.email,
      name: row.user.name,
      company: row.user.company,
      active: row.user.active,
      nip: row.nip,
      vatId: row.vatId,
      contactPerson: row.contactPerson,
      phone: row.phone ?? '',
      ordersEmail: row.ordersEmail,
      accountEur: row.accountEur,
      accountPln: row.accountPln,
      paymentTerms: row.paymentTerms,
      insuranceValue:
        row.insuranceValue && typeof row.insuranceValue.toNumber === 'function'
          ? row.insuranceValue.toNumber()
          : (row.insuranceValue as unknown as number | null),
      insuranceExpiry: row.insuranceExpiry,
      licenseExpiry: row.licenseExpiry,
      numberOfPermits: row.numberOfPermits,
      companyAddress: row.companyAddress,
      opiekunId: row.opiekunId ?? '',
      opiekun:
        row.opiekun ?? { id: row.opiekunId ?? '', login: '', name: null },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}
