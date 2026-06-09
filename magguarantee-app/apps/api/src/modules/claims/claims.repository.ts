import { Injectable } from '@nestjs/common';

import { ClaimStatus as PrismaClaimStatus } from '@magguarantee/database';
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
  statusBeforeReklamacja: ClaimStatus | null;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: number | null;
  /** Immutable carrier time-window snapshot (`HH:mm`) — set once at submit. */
  origTimeFrom: string | null;
  origTimeTo: string | null;
  /** Immutable carrier snapshot — set once at submit, never modified after. */
  origHoursAdjusted: number | null;
  /** Currently applied hours-adjustment — verifier PATCH mutates only this. */
  hoursAdjustedValue: number | null;

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
  /**
   * Hours-adjustment values are written EQUAL at submit. `origHoursAdjusted`
   * is the immutable carrier snapshot; `hoursAdjustedValue` is the value
   * that drives km-calc (verifier PATCH may mutate it later, but at submit
   * the two are the same). `null` is reserved for "no data" — a carrier who
   * explicitly enters `0` still gets `0` persisted.
   */
  origHoursAdjusted: number | null;
  hoursAdjustedValue: number | null;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: number | null;
  /** Immutable carrier time-window snapshot (`HH:mm`) — set once at submit. */
  origTimeFrom: string | null;
  origTimeTo: string | null;
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
  /**
   * Carrier-snapshot value. Set ONLY by `ClaimsService.submit()` (and mirrored
   * by `submitReklamacja` alongside the other `orig*` fields). The verifier
   * PATCH path NEVER writes this — `origHoursAdjusted` is immutable after the
   * carrier's submit.
   */
  origHoursAdjusted?: number | null;

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
  /**
   * Verifier-mutable hours-adjustment. Drives km-calc — service writes the
   * raw numeric value here (Prisma coerces to `Decimal(5,2)`).
   */
  hoursAdjustedValue?: number | null;

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
  /**
   * Maksim-handshake token (UUID v4). Minted by
   * `ClaimsService.requestAuthorization` on every fresh request — a future
   * Maksim-approve endpoint will validate clicks against this value. The
   * column is nullable in the schema; passing `null` here clears it.
   *
   * Phase 4.2 — currently written ONLY by the request-authorization path;
   * the verifier PATCH flow leaves it `undefined` (untouched).
   */
  authorizationToken?: string | null;
}

/**
 * Read/write surface for `Claim`. Wraps Prisma so services and controllers
 * never touch `prisma.client.claim` directly (api-agent guideline).
 */
@Injectable()
export class ClaimsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ClaimRow | null> {
    const row = await this.prisma.tx.claim.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  async findByNrZgl(nrZgl: string): Promise<ClaimRow | null> {
    const row = await this.prisma.tx.claim.findFirst({
      where: { nrZgl },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  /**
   * Finds the most recent non-ODRZUCONO claim for the given vehicle. Used by
   * the submit pipeline to enforce the per-vehicle cooldown gate (replacing
   * the legacy date-range overlap check). Returns only the minimum columns
   * needed by `cooldownCheck()` from `@magguarantee/shared` — the full
   * `ClaimRow` flattening is unnecessary here and skipping the joins keeps
   * the hot path cheap.
   *
   * `ODRZUCONO` (rejected) claims are excluded — a carrier whose previous
   * claim was rejected can resubmit immediately. Soft-deleted rows are
   * filtered upstream by the Prisma soft-delete extension; the explicit
   * `deletedAt: null` below is defence in depth.
   *
   * Backed by the composite index `(vehicleId, createdAt)` from the
   * `claim_vehicle_createdat_index_and_carrier_thresholds` migration.
   */
  async findLastNonRejectedForVehicle(
    vehicleId: string,
  ): Promise<{ id: string; nrZgl: string; createdAt: Date } | null> {
    const row = await this.prisma.tx.claim.findFirst({
      where: {
        vehicleId,
        status: { not: PrismaClaimStatus.ODRZUCONO },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, nrZgl: true, createdAt: true },
    });
    return row ?? null;
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
    const rows = await this.prisma.tx.claim.findMany({
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
        // Both columns receive the same numeric value at submit (Prisma coerces
        // `number` → `Decimal(5,2)`). `origHoursAdjusted` will not be touched
        // again; `hoursAdjustedValue` is what the verifier may later override.
        origHoursAdjusted: data.origHoursAdjusted,
        hoursAdjustedValue: data.hoursAdjustedValue,
        origDateStart: data.origDateStart,
        origDateEnd: data.origDateEnd,
        origMileage: data.origMileage,
        // Immutable carrier time-window snapshot — written once here, never
        // touched by the verifier PATCH (`_buildUpdatePayload` omits them).
        origTimeFrom: data.origTimeFrom,
        origTimeTo: data.origTimeTo,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: UpdateClaimData): Promise<ClaimRow> {
    const row = await this.prisma.tx.claim.update({
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
    set('origHoursAdjusted');
    set('dateStart');
    set('dateEnd');
    set('timeFrom');
    set('timeTo');
    set('mileage');
    set('hoursAdjustedValue');
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
    set('authorizationToken');
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
      breakdown: hydrateBreakdown(row.breakdown),
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
      statusBeforeReklamacja: row.statusBeforeReklamacja,
      origDateStart: row.origDateStart,
      origDateEnd: row.origDateEnd,
      origMileage: decimalToNumber(row.origMileage),
      // Immutable carrier time-window snapshot — plain `HH:mm` strings, no
      // Decimal coercion. Forwarded as-is; `null` means the column is NULL.
      origTimeFrom: row.origTimeFrom,
      origTimeTo: row.origTimeTo,
      // Both Decimal(5,2) columns surface as `Decimal` objects from Prisma;
      // `decimalToNumber` preserves null and round-trips the numeric scale.
      origHoursAdjusted: decimalToNumber(row.origHoursAdjusted),
      hoursAdjustedValue: decimalToNumber(row.hoursAdjustedValue),
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
  statusBeforeReklamacja: ClaimStatus | null;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: { toNumber(): number } | number | null;
  origTimeFrom: string | null;
  origTimeTo: string | null;
  origHoursAdjusted: { toNumber(): number } | number | null;
  hoursAdjustedValue: { toNumber(): number } | number | null;
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

/**
 * Coerce a raw `Claim.breakdown` JSONB cell into the runtime `KmCalcBreakdown`
 * shape. Legacy rows persisted before the `rawTotalDays` field was added
 * (see docs/14-design-system.md §"Phase 3.1" / `KmCalcBreakdownSchema`) do
 * NOT carry the key — backfill it from `totalDays` so the `<HoursReadout>`
 * UI collapses to a single value rather than rendering `undefined`.
 *
 * The DB read path bypasses Zod parsing (we trust our own writes), so the
 * `.transform()` defined on `KmCalcBreakdownSchema` does NOT run here. Hence
 * the explicit hydration call.
 */
function hydrateBreakdown(raw: unknown): KmCalcBreakdown | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return null;
  const obj = raw as Partial<KmCalcBreakdown> & {
    totalDays?: number;
    rawTotalDays?: number;
  };
  const totalDays = typeof obj.totalDays === 'number' ? obj.totalDays : 0;
  const rawTotalDays =
    typeof obj.rawTotalDays === 'number' ? obj.rawTotalDays : totalDays;
  return {
    ...(obj as KmCalcBreakdown),
    rawTotalDays,
  };
}
