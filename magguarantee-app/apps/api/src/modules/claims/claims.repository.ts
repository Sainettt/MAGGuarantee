import { Injectable } from '@nestjs/common';

import { ClaimStatus as PrismaClaimStatus } from '@magguarantee/database';
import type {
  ClaimAttachmentCategory,
  ClaimAutoRecalcState,
  ClaimStatus,
  DelegationStatus,
  KmCalcBreakdown,
  ReklamacjaResolution,
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

  /**
   * Verification checkpoint (pracownik «Zapisz weryfikację»). `verifiedAt` is
   * when the verifier confirmed the claim's data; `verifiedBy(Id)` mirrors the
   * `decidedBy` pattern. Both `null` until verified (reset to `null` by the
   * delegation auto-recalc — the checkpoint is invalidated when the underlying
   * data changes).
   */
  verifiedAt: Date | null;
  verifiedById: string | null;
  verifiedBy: { id: string; login: string; name: string | null } | null;

  /** The carrier's note from submit. Staff never write it (UWAGI #4). */
  comment: string | null;
  /**
   * The verifier's wniosek-decision text: optional on ZAAKCEPTOWANO, required
   * on ODRZUCONO. Fed by the PATCH wire field `comment` (UWAGI #4).
   */
  decisionComment: string | null;
  /** Nullable per Revert #1 — set only on transition to ZAAKCEPTOWANO. */
  orderNumber: string | null;
  orderDate: Date | null;

  amountApproved: number | null;

  reklamacjaSubmitted: boolean;
  reklamacjaText: string | null;
  reklamacjaResponse: string | null;
  reklamacjaAmount: number | null;
  /**
   * Reklamacja decision columns (REWORK 2026-07-31, migration
   * `20260731120000_add_reklamacja_resolution_fields`).
   *
   *  - `reklamacjaResolution`  — the OUTCOME. `null` = never filed OR pending
   *    (pending ⇔ `status === 'REKLAMACJA'`). The decision rolls `status` back to
   *    `statusBeforeReklamacja` for BOTH outcomes, so the outcome CANNOT be
   *    derived from `status`.
   *  - `reklamacjaOrderNumber` — «Nr zlecenia» an UZNANA reklamacja is paid
   *    under; independent of the wniosek's own `orderNumber` (never touched).
   *  - `reklamacjaSubmittedAt` — when the carrier filed (`statusChangedAt` is
   *    re-stamped by the decision, so it cannot stand in).
   *  - `reklamacjaDecidedAt` / `reklamacjaDecidedById` — when / by whom the
   *    reklamacja was decided. Distinct from the claim-level
   *    `decidedById`, which keeps the ORIGINAL wniosek decision actor.
   */
  reklamacjaResolution: ReklamacjaResolution | null;
  reklamacjaOrderNumber: string | null;
  reklamacjaSubmittedAt: Date | null;
  reklamacjaDecidedAt: Date | null;
  reklamacjaDecidedById: string | null;
  statusBeforeReklamacja: ClaimStatus | null;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: number | null;
  /**
   * Immutable submit-time payment snapshot (Decimal(12,2) → number). Set once at
   * create alongside the other `orig*` fields; never mutated by the verifier
   * PATCH / checkpoint. `null` for legacy rows created before this column.
   */
  origPaymentEur: number | null;
  /** Immutable carrier time-window snapshot (`HH:mm`) — set once at submit. */
  origTimeFrom: string | null;
  origTimeTo: string | null;
  /** Immutable carrier snapshot — set once at submit, never modified after. */
  origHoursAdjusted: number | null;
  /** Currently applied hours-adjustment — verifier PATCH mutates only this. */
  hoursAdjustedValue: number | null;

  /**
   * Maksim authorization gate. Armed by `verifyClaim` when the final dopłata
   * STRICTLY exceeds
   * `getAuthThreshold(drivenDays)`; blocks the accept/reject decision until the
   * confirmation screenshot lands. All four reset in lockstep with `verifiedAt`
   * via `_resetVerificationState` whenever the verification is invalidated.
   *
   *  - `maksimGateRequired`     — the gate is active.
   *  - `maksimGateNotifiedAt`   — auto-email dedup stamp (`null` = not sent).
   *  - `maksimGateNotifiedAmount` — the over-threshold dopłata (Decimal(12,2) →
   *    number) that the last Maksim notification carried. `null` = never
   *    notified (or legacy row); used for AMOUNT-aware dedup so a re-verify that
   *    MOVES the over-threshold amount re-notifies Maksim (see
   *    `ClaimsService._applyMaksimGate`).
   *  - `maksimGateClearedAt`    — when the screenshot lifted the gate (`null`
   *    while still blocking).
   *  - `maksimGateClearedById`  — who uploaded the confirmation (mirror of
   *    `verifiedById`).
   */
  maksimGateRequired: boolean;
  maksimGateNotifiedAt: Date | null;
  maksimGateNotifiedAmount: number | null;
  maksimGateClearedAt: Date | null;
  maksimGateClearedById: string | null;

  attachments: {
    id: string;
    category: ClaimAttachmentCategory;
    url: string;
    mimeType: string | null;
    size: number | null;
    uploadedById: string | null;
    createdAt: Date;
  }[];

  /**
   * Phase 7 REWORK (2026-06-20 #4) — the outing this wniosek was filed against
   * (`@unique` FK → Delegation). Nullable for legacy/pre-rework rows; set at
   * submit for new wnioski.
   */
  delegationId: string | null;
  /**
   * The linked outing's DEPARTURE (zgłoszony `departureAt` + verifier-set
   * `actualDepartureAt`), embedded so the Maksim confirmation email can show
   * "Odjazd: zgłoszony → faktyczny" without a second query. Both `null` when
   * there is no linked outing; `actualDepartureAt` `null` until `w_trasie`.
   */
  delegationDepartureAt: Date | null;
  delegationActualDepartureAt: Date | null;
  /**
   * The linked outing's plan/fakt return (from the `delegation` relation),
   * embedded so the DTO can surface them without a second query. Both `null`
   * when there is no linked outing; `actual` `null` until `zjechal`.
   */
  delegationPlannedReturnAt: Date | null;
  delegationActualReturnAt: Date | null;
  /**
   * The linked outing's lifecycle status (from the `delegation` relation),
   * embedded so the verifier-side in-transit gate (`_assertDelegationReturned`)
   * and the pracownik ClaimModal read it without a second `GET /delegations/:id`
   * (role-gated). `null` when there is no linked outing. The service blocks
   * `verify` / `update` (accept/reject) while this is `'w_trasie'` (422
   * `CLAIM_DELEGATION_IN_TRANSIT`); a `'zjechal'` outing (or a claim with no
   * `delegationId`) passes through.
   */
  delegationStatus: DelegationStatus | null;
  /**
   * `true` once a pracownik PATCHed `dateStart`/`dateEnd` — the boundary that
   * disables the delegation auto-recalc.
   */
  periodAdjustedByVerifier: boolean;
  /**
   * Stored result of the `w_trasie → zjechal` auto-recalc (Prisma
   * `ClaimAutoRecalcState`, default `none`). The api sets `applied`/`skipped`
   * on the delegation recalc; the frontend reads it directly. See
   * `ClaimsService.recalcFromDelegation`.
   */
  autoRecalcState: ClaimAutoRecalcState;

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
  /**
   * Immutable submit-time payment snapshot — written once at create (same
   * contract as `origMileage`). Prisma coerces `number` → `Decimal(12,2)`.
   */
  origPaymentEur: number | null;
  /** Immutable carrier time-window snapshot (`HH:mm`) — set once at submit. */
  origTimeFrom: string | null;
  origTimeTo: string | null;
  /**
   * Phase 7 REWORK (2026-06-20 #4) — the outing this wniosek links to. Set at
   * submit for new wnioski; the DB FK is `@unique`, so a duplicate surfaces as
   * P2002 (the service maps it to a 409).
   */
  delegationId: string | null;
}

export interface UpdateClaimData {
  // ── carrier-side reklamacja path (used by submitReklamacja) ──
  reklamacjaSubmitted?: boolean;
  reklamacjaText?: string | null;
  reklamacjaAmount?: number | null;
  reklamacjaResponse?: string | null;
  /** Carrier's filing timestamp — written once by `submitReklamacja`. */
  reklamacjaSubmittedAt?: Date | null;

  // ── staff-side reklamacja decision (REWORK 2026-07-31) ──
  /**
   * `UZNANA` / `ODRZUCONA`. Written ONLY by the `REKLAMACJA_*` PATCH branches,
   * together with `status = statusBeforeReklamacja` — the outcome never leaks
   * into the claim status. `UZNANA` requires a non-empty
   * `reklamacjaOrderNumber` (DB CHECK `claim_reklamacja_resolution_complete`).
   */
  reklamacjaResolution?: ReklamacjaResolution | null;
  reklamacjaOrderNumber?: string | null;
  /**
   * Written from the SAME `Date` instance as `statusChangedAt` on a reklamacja
   * decision — the weekly report relies on that exact equality to tell a
   * status-rollback apart from a fresh decision (see
   * `WeeklyReportRepository.windowStats`).
   */
  reklamacjaDecidedAt?: Date | null;
  reklamacjaDecidedById?: string | null;

  // ── status & workflow (Phase 4 verification) ──
  status?: ClaimStatus;
  statusChangedAt?: Date | null;
  statusBeforeReklamacja?: ClaimStatus | null;
  decidedById?: string | null;

  /**
   * Verification checkpoint stamp. Set by `ClaimsService.verifyClaim` (the
   * «Zapisz weryfikację» endpoint) and RESET to `null` by the delegation
   * auto-recalc (`_applyDelegationRecalc`) because the checkpoint is
   * invalidated when the underlying data changes. Omitted (`undefined`) ⇒ the
   * column keeps its current value; `null` clears it.
   */
  verifiedAt?: Date | null;
  verifiedById?: string | null;

  /**
   * Maksim authorization gate columns. Armed by `verifyClaim`
   * (`maksimGateRequired=true` + `maksimGateNotifiedAt=now` on the first
   * over-threshold save), cleared by the confirmation upload
   * (`maksimGateClearedAt`/`maksimGateClearedById`), and reset in lockstep with
   * `verifiedAt` by `_resetVerificationState`. Omitted (`undefined`) ⇒ the
   * column keeps its current value; `null` clears it.
   */
  maksimGateRequired?: boolean;
  maksimGateNotifiedAt?: Date | null;
  /**
   * Amount-aware dedup stamp (Decimal(12,2) → number). Written alongside
   * `maksimGateNotifiedAt` by `_applyMaksimGate` (the over-threshold dopłata the
   * last notification carried) and reset in lockstep with `verifiedAt` by
   * `_resetVerificationState`. Omitted (`undefined`) ⇒ the column keeps its
   * current value; `null` clears it.
   */
  maksimGateNotifiedAmount?: number | null;
  maksimGateClearedAt?: Date | null;
  maksimGateClearedById?: string | null;

  /**
   * Phase 7 REWORK (2026-06-20 #4) — set `true` by the verifier PATCH whenever
   * `dateStart`/`dateEnd` change, marking the period as human-adjusted so the
   * delegation auto-recalc no longer overwrites it.
   */
  periodAdjustedByVerifier?: boolean;
  /**
   * Stored auto-recalc result (Prisma `ClaimAutoRecalcState`). Written by
   * `ClaimsService.recalcFromDelegation` (`applied`/`skipped`) on the
   * `w_trasie → zjechal` transition, and reset to `none` by the verifier PATCH
   * when a human edits the period (the «wymaga uwagi» badge then goes dark).
   * Omitted (`undefined`) ⇒ the column is left at its current value.
   */
  autoRecalcState?: ClaimAutoRecalcState;

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
  /**
   * The carrier's submit note. No staff path sets it any more (UWAGI #4); the
   * key stays so the type keeps describing the column.
   */
  comment?: string | null;
  /** Verifier's ZAAKCEPTOWANO / ODRZUCONO justification (UWAGI #4). */
  decisionComment?: string | null;
  orderNumber?: string | null;
  orderDate?: Date | null;
  amountApproved?: number | null;
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
   * Finds the (at most one — `@unique` FK) claim linked to an outing. Goes
   * through `prisma.tx`, so a read taken inside the delegation `returned()`
   * `@Audit`-opened transaction sees the same uncommitted state and the
   * subsequent recalc update commits atomically with the outing status +
   * `Vehicle.lastDroveAt` bump. Returns `null` when no wniosek is linked (the
   * common case — the recalc is then a no-op).
   */
  async findByDelegationId(delegationId: string): Promise<ClaimRow | null> {
    const row = await this.prisma.tx.claim.findFirst({
      where: { delegationId, deletedAt: null },
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
        // A fresh wniosek has no decision. Deliberately not part of
        // `CreateClaimData`, so the carrier submit cannot set it.
        decisionComment: null,
        orderNumber: data.orderNumber,
        orderDate: data.orderDate,
        // Both columns receive the same numeric value at submit (Prisma coerces
        // `number` → `Decimal(5,2)`). `origHoursAdjusted` will not be touched
        // again; `hoursAdjustedValue` is what the verifier may later override.
        origHoursAdjusted: data.origHoursAdjusted,
        hoursAdjustedValue: data.hoursAdjustedValue,
        origDateStart: data.origDateStart,
        origDateEnd: data.origDateEnd,
        origMileage: data.origMileage,
        // Immutable submit-time payment snapshot — write-once here (same
        // contract as origMileage); the verifier PATCH / checkpoint never
        // touches it (`_buildUpdatePayload` has no key for it).
        origPaymentEur: data.origPaymentEur,
        // Immutable carrier time-window snapshot — written once here, never
        // touched by the verifier PATCH (`_buildUpdatePayload` omits them).
        origTimeFrom: data.origTimeFrom,
        origTimeTo: data.origTimeTo,
        // Phase 7 REWORK (2026-06-20 #4) — link to the outing. `@unique` FK; a
        // duplicate surfaces as P2002 → the service maps it to a 409.
        delegationId: data.delegationId,
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
    set('reklamacjaSubmittedAt');
    set('reklamacjaResolution');
    set('reklamacjaOrderNumber');
    set('reklamacjaDecidedAt');
    set('reklamacjaDecidedById');
    set('status');
    set('statusChangedAt');
    set('statusBeforeReklamacja');
    set('decidedById');
    set('verifiedAt');
    set('verifiedById');
    set('maksimGateRequired');
    set('maksimGateNotifiedAt');
    set('maksimGateNotifiedAmount');
    set('maksimGateClearedAt');
    set('maksimGateClearedById');
    set('periodAdjustedByVerifier');
    set('autoRecalcState');
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
    set('decisionComment');
    set('orderNumber');
    set('orderDate');
    set('amountApproved');
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
      // Embed the linked outing's plan/fakt return AND plan/fakt departure so
      // the pracownik ClaimModal + the Maksim confirmation email render them
      // without a separate `GET /delegations/:id` (role-gated).
      delegation: {
        select: {
          status: true,
          departureAt: true,
          actualDepartureAt: true,
          plannedReturnAt: true,
          actualReturnAt: true,
        },
      },
      decidedBy: { select: { id: true, login: true, name: true } },
      // Verification checkpoint author — mirror of `decidedBy` (relation
      // "ClaimVerifiedBy"). Populated whenever `verifiedById` is set.
      verifiedBy: { select: { id: true, login: true, name: true } },
      attachments: {
        select: {
          id: true,
          category: true,
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
      verifiedAt: row.verifiedAt,
      verifiedById: row.verifiedById,
      verifiedBy: row.verifiedBy ?? null,
      comment: row.comment,
      // `?? null`: defensive sentinel for the soft-delete extension's widened
      // inferred type (mirrors the reklamacja columns below).
      decisionComment: row.decisionComment ?? null,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate,
      amountApproved: decimalToNumber(row.amountApproved),
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      reklamacjaText: row.reklamacjaText,
      reklamacjaResponse: row.reklamacjaResponse,
      reklamacjaAmount: decimalToNumber(row.reklamacjaAmount),
      // Reklamacja decision columns — plain scalars, forwarded verbatim.
      // `?? null` is a defensive sentinel for the soft-delete extension's
      // widened inferred type (mirrors `autoRecalcState` below).
      reklamacjaResolution: row.reklamacjaResolution ?? null,
      reklamacjaOrderNumber: row.reklamacjaOrderNumber ?? null,
      reklamacjaSubmittedAt: row.reklamacjaSubmittedAt ?? null,
      reklamacjaDecidedAt: row.reklamacjaDecidedAt ?? null,
      reklamacjaDecidedById: row.reklamacjaDecidedById ?? null,
      statusBeforeReklamacja: row.statusBeforeReklamacja,
      origDateStart: row.origDateStart,
      origDateEnd: row.origDateEnd,
      origMileage: decimalToNumber(row.origMileage),
      // Immutable submit-time payment snapshot — same Decimal(12,2) →
      // number round-trip as `paymentEur`; `null` preserved for legacy rows.
      origPaymentEur: decimalToNumber(row.origPaymentEur),
      // Immutable carrier time-window snapshot — plain `HH:mm` strings, no
      // Decimal coercion. Forwarded as-is; `null` means the column is NULL.
      origTimeFrom: row.origTimeFrom,
      origTimeTo: row.origTimeTo,
      // Both Decimal(5,2) columns surface as `Decimal` objects from Prisma;
      // `decimalToNumber` preserves null and round-trips the numeric scale.
      origHoursAdjusted: decimalToNumber(row.origHoursAdjusted),
      hoursAdjustedValue: decimalToNumber(row.hoursAdjustedValue),
      maksimGateRequired: row.maksimGateRequired,
      maksimGateNotifiedAt: row.maksimGateNotifiedAt,
      // Amount-aware dedup stamp — same Decimal(12,2) → number round-trip as
      // `paymentEur`/`origPaymentEur`; `null` preserved for never-notified rows.
      maksimGateNotifiedAmount: decimalToNumber(row.maksimGateNotifiedAmount),
      maksimGateClearedAt: row.maksimGateClearedAt,
      maksimGateClearedById: row.maksimGateClearedById,
      attachments: row.attachments.map((a) => ({
        id: a.id,
        category: a.category,
        url: a.url,
        mimeType: a.mimeType,
        size: a.size,
        uploadedById: a.uploadedById,
        createdAt: a.createdAt,
      })),
      delegationId: row.delegationId,
      delegationDepartureAt: row.delegation?.departureAt ?? null,
      delegationActualDepartureAt: row.delegation?.actualDepartureAt ?? null,
      delegationPlannedReturnAt: row.delegation?.plannedReturnAt ?? null,
      delegationActualReturnAt: row.delegation?.actualReturnAt ?? null,
      delegationStatus: row.delegation?.status ?? null,
      periodAdjustedByVerifier: row.periodAdjustedByVerifier,
      // Prisma enum default is `none`; the `?? 'none'` is a defensive sentinel
      // for the soft-delete extension's widened inferred type.
      autoRecalcState: row.autoRecalcState ?? 'none',
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
  verifiedAt: Date | null;
  verifiedById: string | null;
  verifiedBy?: { id: string; login: string; name: string | null } | null;
  comment: string | null;
  decisionComment?: string | null;
  orderNumber: string | null;
  orderDate: Date | null;
  amountApproved: { toNumber(): number } | number | null;
  reklamacjaSubmitted: boolean;
  reklamacjaText: string | null;
  reklamacjaResponse: string | null;
  reklamacjaAmount: { toNumber(): number } | number | null;
  reklamacjaResolution?: ReklamacjaResolution | null;
  reklamacjaOrderNumber?: string | null;
  reklamacjaSubmittedAt?: Date | null;
  reklamacjaDecidedAt?: Date | null;
  reklamacjaDecidedById?: string | null;
  statusBeforeReklamacja: ClaimStatus | null;
  origDateStart: Date | null;
  origDateEnd: Date | null;
  origMileage: { toNumber(): number } | number | null;
  origPaymentEur: { toNumber(): number } | number | null;
  origTimeFrom: string | null;
  origTimeTo: string | null;
  origHoursAdjusted: { toNumber(): number } | number | null;
  hoursAdjustedValue: { toNumber(): number } | number | null;
  maksimGateRequired: boolean;
  maksimGateNotifiedAt: Date | null;
  maksimGateNotifiedAmount: { toNumber(): number } | number | null;
  maksimGateClearedAt: Date | null;
  maksimGateClearedById: string | null;
  attachments: {
    id: string;
    category: ClaimAttachmentCategory;
    url: string;
    mimeType: string | null;
    size: number | null;
    uploadedById: string | null;
    createdAt: Date;
  }[];
  delegationId: string | null;
  delegation?: {
    status: DelegationStatus;
    departureAt: Date | null;
    actualDepartureAt: Date | null;
    plannedReturnAt: Date | null;
    actualReturnAt: Date | null;
  } | null;
  periodAdjustedByVerifier: boolean;
  autoRecalcState: ClaimAutoRecalcState | null;
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
 * Same story for `firstDay` / `lastDay` (the credited boundary-day fractions):
 * rows written before those fields existed lack the keys, so backfill them to
 * `null` — the same fallback `KmCalcBreakdownSchema.default(null)` would apply
 * via Zod. `null` here means "unknown for a legacy row", distinct from a valid
 * computed `{ date, fraction: 0 }` (an excluded boundary day on a fresh calc).
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
    daysActive?: number;
    daysTotal?: number;
  };
  const totalDays = typeof obj.totalDays === 'number' ? obj.totalDays : 0;
  const rawTotalDays =
    typeof obj.rawTotalDays === 'number' ? obj.rawTotalDays : totalDays;
  return {
    ...(obj as KmCalcBreakdown),
    rawTotalDays,
    // Legacy rows predate the boundary-day fields — default to null.
    firstDay: obj.firstDay ?? null,
    lastDay: obj.lastDay ?? null,
    // Settlement fields (feature «wyłączane limity gwarancji», 2026-09-20).
    // Rows written before it had every period active by construction, so both
    // day counters collapse to `totalDays`. `mileageEffective` and
    // `mileageSource` are deliberately NOT backfilled (they ride along in the
    // spread above when present): an absent `mileageEffective` makes the UI
    // render `claim.mileage`, an absent `mileageSource` means `'declared'`
    // (same contract as `KmCalcBreakdownSchema`'s transform).
    daysActive: typeof obj.daysActive === 'number' ? obj.daysActive : totalDays,
    daysTotal: typeof obj.daysTotal === 'number' ? obj.daysTotal : totalDays,
  };
}
