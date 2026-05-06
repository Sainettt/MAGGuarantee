import { Injectable } from '@nestjs/common';

import type {
  ClaimStatus,
  KmCalcBreakdown,
} from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the claims repository — service maps to DTO.
 *
 * Decimals are surfaced as `number | null` here so the service never has
 * to call `.toNumber()`. Joins are flattened to mini-reference shapes that
 * match the wire DTOs (`{id, login, name}` / `{id, plateNumber}`).
 */
export interface ClaimRow {
  id: string;
  nrZgl: string;

  carrierId: string;
  carrier: { id: string; login: string; name: string | null } | null;

  vehicleId: string | null;
  vehicle: { id: string; plateNumber: string } | null;
  vehiclePlateSnapshot: string;

  dateStart: Date;
  dateEnd: Date;
  timeFrom: string | null;
  timeTo: string | null;

  drivenDays: number | null;
  mileage: number | null;
  kmPerDay: number | null;
  kmGuaranteed: number | null;
  kmDifference: number | null;
  paymentEur: number | null;
  ratePerKmEffective: number | null;
  breakdown: KmCalcBreakdown | null;

  status: ClaimStatus;
  statusChangedAt: Date | null;
  decidedById: string | null;
  decidedBy: { id: string; login: string; name: string | null } | null;

  comment: string | null;
  orderNumber: string | null;
  orderDate: Date | null;

  authorizationRequired: boolean;
  authorizationDescription: string | null;
  authorizationToken: string | null;
  authorizationDecidedAt: Date | null;

  amountRequested: number | null;
  amountApproved: number | null;
  margin: number | null;
  amountMaximum: number | null;

  reklamacjaSubmitted: boolean;
  reklamacjaText: string | null;
  reklamacjaResponse: string | null;
  reklamacjaAmount: number | null;
  hoursAdjusted: boolean;
  statusBeforeReklamacja: ClaimStatus | null;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: number | null;

  authScreenshotUrl: string | null;
  attachments: {
    id: string;
    url: string;
    mimeType: string | null;
    size: number | null;
    uploadedById: string | null;
    createdAt: Date;
  }[];

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ClaimListFilters {
  status?: ClaimStatus;
  carrierId?: string;
  vehicleId?: string;
  /** ISO date `YYYY-MM-DD` — match claims whose `dateStart` ≥ from. */
  from?: string;
  /** ISO date `YYYY-MM-DD` — match claims whose `dateEnd` ≤ to. */
  to?: string;
  q?: string;
  /** Cursor is the previous page tail's `id` (UUID). */
  cursor?: string;
  limit: number;
}

export interface CreateClaimData {
  nrZgl: string;
  carrierId: string;
  vehicleId: string | null;
  vehiclePlateSnapshot: string;
  dateStart: Date;
  dateEnd: Date;
  timeFrom: string | null;
  timeTo: string | null;
  drivenDays: number;
  mileage: number;
  kmPerDay: number | null;
  kmGuaranteed: number;
  kmDifference: number;
  paymentEur: number;
  ratePerKmEffective: number;
  breakdown: KmCalcBreakdown;
  status: ClaimStatus;
  statusChangedAt: Date;
  comment: string | null;
  orderNumber: string | null;
  orderDate: Date | null;
  amountRequested: number;
  hoursAdjusted: boolean;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: number | null;
}

export interface UpdateClaimData {
  reklamacjaSubmitted?: boolean;
  reklamacjaText?: string | null;
  reklamacjaAmount?: number | null;
  status?: ClaimStatus;
  statusChangedAt?: Date | null;
  statusBeforeReklamacja?: ClaimStatus | null;
  origDateStart?: Date | null;
  origDateEnd?: Date | null;
  origMileage?: number | null;
}

/**
 * Read/write surface for `Claim`. Wraps Prisma so services and controllers
 * never touch `prisma.client.claim` directly (api-agent guideline).
 */
@Injectable()
export class ClaimsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ClaimRow | null> {
    const row = await this.prisma.client.claim.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async findByNrZgl(nrZgl: string): Promise<ClaimRow | null> {
    const row = await this.prisma.client.claim.findFirst({
      where: { nrZgl },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: ClaimListFilters): Promise<ClaimRow[]> {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.carrierId) where.carrierId = filters.carrierId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.from) where.dateStart = { gte: new Date(filters.from) };
    if (filters.to) {
      const existing = (where.dateEnd as Record<string, Date>) ?? {};
      where.dateEnd = { ...existing, lte: new Date(filters.to) };
    }
    if (filters.q) {
      const q = filters.q;
      where.OR = [
        { nrZgl: { contains: q, mode: 'insensitive' } },
        { vehiclePlateSnapshot: { contains: q, mode: 'insensitive' } },
        { orderNumber: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.client.claim.findMany({
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

  /**
   * Create a Claim row inside the supplied Prisma transaction client.
   * Callers (`ClaimsService.submit`) compose this with the NrZgl
   * counter-bump in a single `$transaction` so a duplicate claim insert
   * never burns a counter value.
   */
  async createWithin(
    tx: TransactionLike,
    data: CreateClaimData,
  ): Promise<ClaimRow> {
    const row = await tx.claim.create({
      data: {
        nrZgl: data.nrZgl,
        carrierId: data.carrierId,
        vehicleId: data.vehicleId,
        vehiclePlateSnapshot: data.vehiclePlateSnapshot,
        dateStart: data.dateStart,
        dateEnd: data.dateEnd,
        timeFrom: data.timeFrom,
        timeTo: data.timeTo,
        drivenDays: data.drivenDays,
        mileage: data.mileage,
        kmPerDay: data.kmPerDay,
        kmGuaranteed: data.kmGuaranteed,
        kmDifference: data.kmDifference,
        paymentEur: data.paymentEur,
        ratePerKmEffective: data.ratePerKmEffective,
        breakdown: data.breakdown as unknown as object,
        status: data.status,
        statusChangedAt: data.statusChangedAt,
        comment: data.comment,
        orderNumber: data.orderNumber,
        orderDate: data.orderDate,
        amountRequested: data.amountRequested,
        hoursAdjusted: data.hoursAdjusted,
        origDateStart: data.origDateStart,
        origDateEnd: data.origDateEnd,
        origMileage: data.origMileage,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: UpdateClaimData): Promise<ClaimRow> {
    const row = await this.prisma.client.claim.update({
      where: { id },
      data: {
        reklamacjaSubmitted: data.reklamacjaSubmitted,
        reklamacjaText: data.reklamacjaText,
        reklamacjaAmount: data.reklamacjaAmount,
        status: data.status,
        statusChangedAt: data.statusChangedAt,
        statusBeforeReklamacja: data.statusBeforeReklamacja,
        origDateStart: data.origDateStart,
        origDateEnd: data.origDateEnd,
        origMileage: data.origMileage,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
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
      vehicle: { select: { id: true, plateNumber: true } },
      decidedBy: { select: { id: true, login: true, name: true } },
      attachments: {
        select: {
          id: true,
          url: true,
          mimeType: true,
          size: true,
          uploadedById: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' as const },
      },
    } as const;
  }

  private flatten(row: ClaimPrismaShape): ClaimRow {
    return {
      id: row.id,
      nrZgl: row.nrZgl,
      carrierId: row.carrierId,
      carrier: row.carrier
        ? {
            id: row.carrier.id,
            login: row.carrier.user.login,
            name: row.carrier.user.name,
          }
        : null,
      vehicleId: row.vehicleId,
      vehicle: row.vehicle,
      vehiclePlateSnapshot: row.vehiclePlateSnapshot,
      dateStart: row.dateStart,
      dateEnd: row.dateEnd,
      timeFrom: row.timeFrom,
      timeTo: row.timeTo,
      drivenDays: decimalToNumber(row.drivenDays),
      mileage: decimalToNumber(row.mileage),
      kmPerDay: decimalToNumber(row.kmPerDay),
      kmGuaranteed: decimalToNumber(row.kmGuaranteed),
      kmDifference: decimalToNumber(row.kmDifference),
      paymentEur: decimalToNumber(row.paymentEur),
      ratePerKmEffective: decimalToNumber(row.ratePerKmEffective),
      breakdown: (row.breakdown as KmCalcBreakdown | null) ?? null,
      status: row.status,
      statusChangedAt: row.statusChangedAt,
      decidedById: row.decidedById,
      decidedBy: row.decidedBy,
      comment: row.comment,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate,
      authorizationRequired: row.authorizationRequired,
      authorizationDescription: row.authorizationDescription,
      authorizationToken: row.authorizationToken,
      authorizationDecidedAt: row.authorizationDecidedAt,
      amountRequested: decimalToNumber(row.amountRequested),
      amountApproved: decimalToNumber(row.amountApproved),
      margin: decimalToNumber(row.margin),
      amountMaximum: decimalToNumber(row.amountMaximum),
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      reklamacjaText: row.reklamacjaText,
      reklamacjaResponse: row.reklamacjaResponse,
      reklamacjaAmount: decimalToNumber(row.reklamacjaAmount),
      hoursAdjusted: row.hoursAdjusted,
      statusBeforeReklamacja: row.statusBeforeReklamacja,
      origDateStart: row.origDateStart,
      origDateEnd: row.origDateEnd,
      origMileage: decimalToNumber(row.origMileage),
      authScreenshotUrl: row.authScreenshotUrl,
      attachments: row.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        mimeType: a.mimeType,
        size: a.size,
        uploadedById: a.uploadedById,
        createdAt: a.createdAt,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

// ─── Prisma row shape (loose — Decimal columns surface as `{toNumber}`) ──

interface ClaimPrismaShape {
  id: string;
  nrZgl: string;
  carrierId: string;
  carrier: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
  vehicleId: string | null;
  vehicle: { id: string; plateNumber: string } | null;
  vehiclePlateSnapshot: string;
  dateStart: Date;
  dateEnd: Date;
  timeFrom: string | null;
  timeTo: string | null;
  drivenDays: { toNumber(): number } | number | null;
  mileage: { toNumber(): number } | number | null;
  kmPerDay: { toNumber(): number } | number | null;
  kmGuaranteed: { toNumber(): number } | number | null;
  kmDifference: { toNumber(): number } | number | null;
  paymentEur: { toNumber(): number } | number | null;
  ratePerKmEffective: { toNumber(): number } | number | null;
  breakdown: unknown;
  status: ClaimStatus;
  statusChangedAt: Date | null;
  decidedById: string | null;
  decidedBy: { id: string; login: string; name: string | null } | null;
  comment: string | null;
  orderNumber: string | null;
  orderDate: Date | null;
  authorizationRequired: boolean;
  authorizationDescription: string | null;
  authorizationToken: string | null;
  authorizationDecidedAt: Date | null;
  amountRequested: { toNumber(): number } | number | null;
  amountApproved: { toNumber(): number } | number | null;
  margin: { toNumber(): number } | number | null;
  amountMaximum: { toNumber(): number } | number | null;
  reklamacjaSubmitted: boolean;
  reklamacjaText: string | null;
  reklamacjaResponse: string | null;
  reklamacjaAmount: { toNumber(): number } | number | null;
  hoursAdjusted: boolean;
  statusBeforeReklamacja: ClaimStatus | null;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: { toNumber(): number } | number | null;
  authScreenshotUrl: string | null;
  attachments: {
    id: string;
    url: string;
    mimeType: string | null;
    size: number | null;
    uploadedById: string | null;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Minimal interface a transaction client must satisfy for `createWithin`.
 * We keep it loose because Prisma's generated types are heavily generic and
 * the soft-delete extension complicates the surface.
 */
export interface TransactionLike {
  claim: {
    create(args: {
      data: Record<string, unknown>;
      include?: unknown;
    }): Promise<ClaimPrismaShape>;
  };
  claimSequence: {
    upsert(args: {
      where: { yearMonth: string };
      create: { yearMonth: string; lastNumber: number };
      update: { lastNumber: { increment: number } };
    }): Promise<{ yearMonth: string; lastNumber: number }>;
  };
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
