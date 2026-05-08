import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the carrier repository — flattens `user` so the
 * service can map straight to the wire DTO without re-walking the join.
 *
 * `phone` and `opiekunId` are non-nullable since the phase-2 migration; the
 * phase3_blocks migration tightened the rest of the operational fields
 * (`contactPerson`, `ordersEmail`, `accountEur`, `paymentTerms`,
 * `insuranceValue`, `insuranceExpiry`, `licenseExpiry`, `companyAddress`)
 * to NOT NULL — the row shape mirrors that. `insuranceValue` is NOT NULL
 * Decimal(12,2) and surfaces here as `number`.
 *
 * `email` follows the User column which is also NOT NULL post-phase3_blocks.
 */
export interface CarrierRow {
  id: string;
  userId: string;
  login: string;
  email: string;
  name: string | null;
  company: string | null;
  active: boolean;
  // NOT NULL since 20260508_carrier_nip_vat_required. Both sides of the wire
  // are now non-null.
  nip: string;
  vatId: string;
  contactPerson: string;
  phone: string;
  ordersEmail: string;
  accountEur: string;
  accountPln: string | null;
  paymentTerms: number;
  insuranceValue: number;
  insuranceExpiry: Date | null;
  licenseExpiry: Date | null;
  numberOfPermits: number | null;
  companyAddress: string;
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
  active?: boolean;
  // carrier-extension side — required fields per phase3_blocks.
  company?: string | null;
  // Required since carrier_nip_vat_required (20260508).
  nip: string;
  vatId: string;
  contactPerson: string;
  phone: string;
  ordersEmail: string;
  accountEur: string;
  accountPln?: string | null;
  paymentTerms?: number;
  insuranceValue: number;
  insuranceExpiry?: Date | null;
  licenseExpiry?: Date | null;
  numberOfPermits?: number | null;
  companyAddress: string;
  opiekunId: string;
}

interface UpdateCarrierData {
  email?: string;
  name?: string | null;
  company?: string | null;
  active?: boolean;
  passwordHash?: string;
  nip?: string | null;
  vatId?: string | null;
  // PATCH cannot null the post-phase3_blocks NOT NULL columns.
  contactPerson?: string;
  phone?: string;
  ordersEmail?: string;
  accountEur?: string;
  accountPln?: string | null;
  paymentTerms?: number;
  insuranceValue?: number;
  insuranceExpiry?: Date | null;
  licenseExpiry?: Date | null;
  numberOfPermits?: number | null;
  companyAddress?: string;
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
          active: data.active ?? true,
        },
      });
      const carrier = await tx.carrier.create({
        data: {
          userId: user.id,
          company: data.company ?? null,
          nip: data.nip,
          vatId: data.vatId,
          contactPerson: data.contactPerson,
          phone: data.phone,
          ordersEmail: data.ordersEmail,
          accountEur: data.accountEur,
          accountPln: data.accountPln ?? null,
          // DB default is 30 — only forward when caller specified.
          ...(data.paymentTerms !== undefined
            ? { paymentTerms: data.paymentTerms }
            : {}),
          insuranceValue: data.insuranceValue,
          insuranceExpiry: data.insuranceExpiry,
          licenseExpiry: data.licenseExpiry,
          numberOfPermits: data.numberOfPermits ?? null,
          companyAddress: data.companyAddress,
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
    if (data.active !== undefined) userPatch.active = data.active;
    if (data.passwordHash !== undefined) userPatch.passwordHash = data.passwordHash;

    const carrierFields: (keyof UpdateCarrierData)[] = [
      'company',
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
    company: string | null;
    // NOT NULL since carrier_nip_vat_required (20260508). The wider type
    // surfaced by the soft-delete extension is normalised below to the
    // non-null shape the rest of the service expects.
    nip: string | null;
    vatId: string | null;
    // Prisma's inferred type from `findFirst({include: ...})` post the soft-
    // delete extension surfaces scalar columns as `string | null`, even
    // though the schema marks them NOT NULL. We accept the wider shape
    // and fall back defensively — never observed in practice since the
    // phase3_blocks migration enforces non-null at the column level.
    contactPerson: string | null;
    phone: string | null;
    ordersEmail: string | null;
    accountEur: string | null;
    accountPln: string | null;
    paymentTerms: number | null;
    insuranceValue: { toNumber(): number } | number | null;
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
      active: boolean;
    };
    opiekun: { id: string; login: string; name: string | null } | null;
  }): CarrierRow {
    return {
      id: row.id,
      userId: row.userId,
      login: row.user.login,
      email: row.user.email ?? '',
      name: row.user.name,
      company: row.company,
      active: row.user.active,
      nip: row.nip ?? '',
      vatId: row.vatId ?? '',
      contactPerson: row.contactPerson ?? '',
      phone: row.phone ?? '',
      ordersEmail: row.ordersEmail ?? '',
      accountEur: row.accountEur ?? '',
      accountPln: row.accountPln,
      paymentTerms: row.paymentTerms ?? 30,
      // NOT NULL Decimal(12,2) — surface as `number`. Fallback `?? 0` mirrors
      // the same defensive pattern used for NOT NULL Decimal columns in
      // claims.repository.ts; in practice the column never observes null.
      insuranceValue: decimalToNumber(row.insuranceValue) ?? 0,
      insuranceExpiry: row.insuranceExpiry,
      licenseExpiry: row.licenseExpiry,
      numberOfPermits: row.numberOfPermits,
      companyAddress: row.companyAddress ?? '',
      opiekunId: row.opiekunId ?? '',
      opiekun:
        row.opiekun ?? { id: row.opiekunId ?? '', login: '', name: null },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
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
