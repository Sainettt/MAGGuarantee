import { Injectable } from '@nestjs/common';

import type {
  ClaimStatus,
  KmCalcBreakdown,
} from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the claims repository — service maps to DTO.
 *
 * Decimals are surfaced as `number` here (NOT NULL post-phase3_blocks);
 * `orderNumber` and `orderDate` stay nullable per Revert #1.
 * Joins are flattened to mini-reference shapes that match the wire DTOs
 * (`{id, login, name}` / `{id, plateNumber}`).
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
  // NOT NULL post-phase3_blocks.
  timeFrom: string;
  timeTo: string;

  drivenDays: number;
  mileage: number;
  kmPerDay: number;
  kmGuaranteed: number;
  kmDifference: number;
  paymentEur: number;
  ratePerKmEffective: number;
  breakdown: KmCalcBreakdown | null;

  status: ClaimStatus;
  statusChangedAt: Date | null;
  decidedById: string | null;
  decidedBy: { id: string; login: string; name: string | null } | null;

  comment: string | null;
  /** Nullable per Revert #1 — set only on transition to ZAAKCEPTOWANO. */
  orderNumber: string | null;
  orderDate: Date | null;

  authorizationRequired: boolean;
  authorizationDescription: string | null;
  authorizationToken: string | null;
  authorizationDecidedAt: Date | null;

  // amountRequested is NOT NULL since phase3_blocks_audit_revert.
  amountRequested: number;
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
  /** NOT NULL post-phase3_blocks. */
  timeFrom: string;
  timeTo: string;
  drivenDays: number;
  mileage: number;
  /** NOT NULL post-phase3_blocks — calculated as `mileage / drivenDays`. */
  kmPerDay: number;
  kmGuaranteed: number;
  kmDifference: number;
  paymentEur: number;
  ratePerKmEffective: number;
  breakdown: KmCalcBreakdown;
  status: ClaimStatus;
  statusChangedAt: Date;
  comment: string | null;
  /** Nullable per Revert #1 — only set on transition to ZAAKCEPTOWANO. */
  orderNumber: string | null;
  orderDate: Date | null;
  amountRequested: number;
  hoursAdjusted: boolean;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: number | null;
}

export interface UpdateClaimData {
  // ── carrier-side reklamacja path (used by submitReklamacja) ──
  reklamacjaSubmitted?: boolean;
  reklamacjaText?: string | null;
  reklamacjaAmount?: number | null;
  reklamacjaResponse?: string | null;

  // ── status & workflow (Phase 4 verification) ──
  status?: ClaimStatus;
  statusChangedAt?: Date | null;
  statusBeforeReklamacja?: ClaimStatus | null;
  decidedById?: string | null;

  // ── carrier-input snapshots (preserved on first reklamacja transition) ──
  origDateStart?: Date | null;
  origDateEnd?: Date | null;
  origMileage?: number | null;

  // ── verifier corrections (Phase 4) ──
  /** Period start — `Date` at UTC midnight after isoDateToMidnightUtc. */
  dateStart?: Date;
  /** Period end — `Date` at UTC midnight. */
  dateEnd?: Date;
  /** `HH:mm`. */
  timeFrom?: string;
  /** `HH:mm`. */
  timeTo?: string;
  mileage?: number;
  hoursAdjusted?: boolean;

  // ── recomputed km-calc outputs (Phase 4) ──
  drivenDays?: number;
  kmPerDay?: number;
  kmGuaranteed?: number;
  kmDifference?: number;
  paymentEur?: number;
  ratePerKmEffective?: number;
  breakdown?: KmCalcBreakdown;

  // ── decision payload (Phase 4) ──
  comment?: string | null;
  orderNumber?: string | null;
  orderDate?: Date | null;
  amountApproved?: number | null;
  amountMaximum?: number | null;
  margin?: number | null;

  // ── authorization request (Phase 4 — set when targeting OCZEKUJE_*) ──
  authorizationRequired?: boolean;
  authorizationDescription?: string | null;
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

  /**
   * Finds an existing non-rejected claim for the same (carrier, vehicle) whose
   * [dateStart, dateEnd] interval overlaps the given range. Used by the submit
   * pipeline to block duplicate / overlapping period claims.
   *
   * Two intervals [a1,b1] and [a2,b2] overlap iff `a1 ≤ b2 AND a2 ≤ b1`.
   * `ODRZUCONO` (rejected) claims are excluded — those can be re-submitted
   * with corrected data. All other statuses (NA_WERYFIKACJI, ZAAKCEPTOWANO,
   * REKLAMACJA, OCZEKUJE_*, AUTORYZACJA_*) hold the period.
   */
  async findOverlapping(args: {
    carrierId: string;
    vehicleId: string;
    dateStart: Date;
    dateEnd: Date;
  }): Promise<ClaimRow | null> {
    const row = await this.prisma.client.claim.findFirst({
      where: {
        carrierId: args.carrierId,
        vehicleId: args.vehicleId,
        dateStart: { lte: args.dateEnd },
        dateEnd: { gte: args.dateStart },
        status: { not: 'ODRZUCONO' },
      },
      include: this.includeShape(),
      orderBy: { createdAt: 'desc' },
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
      data: this._buildUpdatePayload(data),
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  /**
   * Same as `update()` but runs on a caller-supplied transaction client. Used
   * by `ClaimsService.update()` (Phase 4 verification) so the row write + the
   * `AuditWriter.log({tx})` row commit atomically.
   */
  async updateWithin(
    tx: TransactionLike,
    id: string,
    data: UpdateClaimData,
  ): Promise<ClaimRow> {
    const row = await tx.claim.update({
      where: { id },
      data: this._buildUpdatePayload(data),
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  /**
   * Translate the service-layer `UpdateClaimData` into a Prisma update payload.
   * Each field is written ONLY when explicitly provided — `undefined` keys
   * pass through Prisma untouched so a partial patch doesn't accidentally
   * NULL a column the caller didn't intend to touch.
   *
   * The `breakdown` JSON column is cast through `unknown` to bypass Prisma's
   * `InputJsonValue` invariance (same pattern as `createWithin`).
   */
  private _buildUpdatePayload(data: UpdateClaimData): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    const set = <K extends keyof UpdateClaimData>(key: K): void => {
      if (data[key] !== undefined) payload[key as string] = data[key];
    };
    set('reklamacjaSubmitted');
    set('reklamacjaText');
    set('reklamacjaAmount');
    set('reklamacjaResponse');
    set('status');
    set('statusChangedAt');
    set('statusBeforeReklamacja');
    set('decidedById');
    set('origDateStart');
    set('origDateEnd');
    set('origMileage');
    set('dateStart');
    set('dateEnd');
    set('timeFrom');
    set('timeTo');
    set('mileage');
    set('hoursAdjusted');
    set('drivenDays');
    set('kmPerDay');
    set('kmGuaranteed');
    set('kmDifference');
    set('paymentEur');
    set('ratePerKmEffective');
    set('comment');
    set('orderNumber');
    set('orderDate');
    set('amountApproved');
    set('amountMaximum');
    set('margin');
    set('authorizationRequired');
    set('authorizationDescription');
    if (data.breakdown !== undefined) {
      payload.breakdown = data.breakdown as unknown as object;
    }
    return payload;
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
      vehicle: row.vehicle ?? null,
      vehiclePlateSnapshot: row.vehiclePlateSnapshot,
      dateStart: row.dateStart,
      dateEnd: row.dateEnd,
      // Defensive sentinels for the soft-delete extension's wider inferred
      // type — these columns are NOT NULL post-phase3_blocks. Order-related
      // columns stay nullable per Revert #1.
      timeFrom: row.timeFrom ?? '',
      timeTo: row.timeTo ?? '',
      drivenDays: decimalToNumber(row.drivenDays) ?? 0,
      mileage: decimalToNumber(row.mileage) ?? 0,
      kmPerDay: decimalToNumber(row.kmPerDay) ?? 0,
      kmGuaranteed: decimalToNumber(row.kmGuaranteed) ?? 0,
      kmDifference: decimalToNumber(row.kmDifference) ?? 0,
      paymentEur: decimalToNumber(row.paymentEur) ?? 0,
      ratePerKmEffective: decimalToNumber(row.ratePerKmEffective) ?? 0,
      breakdown: (row.breakdown as KmCalcBreakdown | null) ?? null,
      status: row.status,
      statusChangedAt: row.statusChangedAt,
      decidedById: row.decidedById,
      decidedBy: row.decidedBy ?? null,
      comment: row.comment,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate,
      authorizationRequired: row.authorizationRequired,
      authorizationDescription: row.authorizationDescription,
      authorizationToken: row.authorizationToken,
      authorizationDecidedAt: row.authorizationDecidedAt,
      amountRequested: decimalToNumber(row.amountRequested) ?? 0,
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
  carrier?: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
  vehicleId: string | null;
  vehicle?: { id: string; plateNumber: string } | null;
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
  decidedBy?: { id: string; login: string; name: string | null } | null;
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
    update(args: {
      where: { id: string };
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
