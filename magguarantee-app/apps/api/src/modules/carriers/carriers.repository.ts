import { Injectable } from '@nestjs/common';

import type { OnboardingStatus } from '@magguarantee/shared';

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
  // `nip` is NOT NULL since 20260508_carrier_nip_vat_required.
  // `vatId` is nullable again since 20260515112821_carrier_vat_id_optional —
  // some carriers register without an EU VAT number.
  nip: string;
  vatId: string | null;
  contactPerson: string;
  phone: string;
  ordersEmail: string;
  accountEur: string;
  accountPln: string | null;
  paymentTerms: number;
  insuranceValue: number;
  insuranceExpiry: Date | null;
  licenseExpiry: Date | null;
  numberOfVehicle: number | null;
  companyAddress: string;
  /**
   * Onboarding wizard step. DB default `PENDING_VEHICLE` (migration
   * `20260519095752_carrier_onboarding_status`). Advanced by Vehicle /
   * Trailer / Driver create flows; never regresses. DISPLAY-ONLY.
   */
  onboardingStatus: OnboardingStatus;
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
  /** Optional single-value filter on the onboarding wizard step. */
  onboardingStatus?: OnboardingStatus;
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
  // `nip` is required since carrier_nip_vat_required (20260508).
  // `vatId` is optional again since carrier_vat_id_optional (20260515).
  nip: string;
  vatId?: string | null;
  contactPerson: string;
  phone: string;
  ordersEmail: string;
  accountEur: string;
  accountPln?: string | null;
  paymentTerms?: number;
  insuranceValue: number;
  insuranceExpiry?: Date | null;
  licenseExpiry?: Date | null;
  numberOfVehicle?: number | null;
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
  numberOfVehicle?: number | null;
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
    if (filters.onboardingStatus)
      where.onboardingStatus = filters.onboardingStatus;
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
          vatId: data.vatId ?? null,
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
          numberOfVehicle: data.numberOfVehicle ?? null,
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
      'numberOfVehicle',
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

  /**
   * Conditionally advance `onboardingStatus` to `next` if the current value
   * is in `lowerStatuses`. Atomic via `updateMany`: the WHERE clause filters
   * out rows that are already at-or-past `next`, so the column can only move
   * forward — never regress. Returns the number of rows actually advanced
   * (0 means the carrier was already at-or-past this step; 1 means we
   * moved it forward).
   *
   * No read-modify-write race: `updateMany` is a single statement evaluated
   * server-side. Cheaper than reading first + branching + updating, and
   * race-free without an explicit transaction since the WHERE filter is
   * idempotent.
   *
   * NOTE: we intentionally accept and pass through string literals here
   * (not the Prisma enum runtime value) so this file doesn't need to drag
   * in the `OnboardingStatus` Prisma const — the strings match the enum
   * literals 1:1.
   */
  async advanceOnboardingStatus(
    id: string,
    next: OnboardingStatus,
    lowerStatuses: OnboardingStatus[],
  ): Promise<number> {
    if (lowerStatuses.length === 0) return 0;
    const res = await this.prisma.client.carrier.updateMany({
      where: {
        id,
        deletedAt: null,
        onboardingStatus: { in: lowerStatuses },
      },
      data: { onboardingStatus: next },
    });
    return res.count;
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
    // `nip` is NOT NULL since carrier_nip_vat_required (20260508). The wider
    // type surfaced by the soft-delete extension is normalised below to the
    // non-null shape the rest of the service expects.
    // `vatId` is nullable again since carrier_vat_id_optional (20260515) —
    // we surface null straight through.
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
    numberOfVehicle: number | null;
    companyAddress: string | null;
    // Surfaced as the runtime enum literal (one of the 4 OnboardingStatus
    // values). The widened `string` shape mirrors the defensive pattern used
    // for other NOT NULL columns; in practice the column always has one of
    // the enum values courtesy of the DB default + the soft-delete extension
    // never strips it.
    onboardingStatus: OnboardingStatus | string | null;
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
      vatId: row.vatId,
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
      numberOfVehicle: row.numberOfVehicle,
      companyAddress: row.companyAddress ?? '',
      // DB default is PENDING_VEHICLE; null is never observed in practice.
      onboardingStatus: (row.onboardingStatus ?? 'PENDING_VEHICLE') as OnboardingStatus,
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
