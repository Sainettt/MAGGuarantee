// Phase 3 — Claims DTO contracts.
//
// Source of truth for `/api/v1/claims/*` per docs/13-api-design.md#claims
// and the `Claim` model in packages/database/prisma/schema.prisma:305+.
//
// Carriers submit claims; pracownik / admin verify and decide; perevoznik
// can file a `reklamacja` against a decided claim. The carrier identity
// is derived server-side from the JWT — never accepted in the body.

import { z } from 'zod';

import {
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';

// ─── Enums (mirror Prisma — kept as zod enums for runtime parity) ──

/**
 * Mirror of Prisma `ClaimStatus`. The legacy GAS used the labels
 * (with spaces and Polish characters) directly; on the wire we use the
 * underscored TypeScript identifiers — Prisma's `@map(...)` translates
 * to the DB enum literal at the storage layer.
 */
export const ClaimStatusSchema = z.enum([
  'NA_WERYFIKACJI',
  'ZAAKCEPTOWANO',
  'ODRZUCONO',
  'REKLAMACJA',
  'OCZEKUJE_NA_AUTORYZACJE',
  'AUTORYZACJA_KWOTA_MAKSIMA',
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

/**
 * Mirror of the Prisma `ClaimAutoRecalcState` enum (migration
 * `20260622122559_claim_auto_recalc_state`). The shared package is dependency-
 * free (Zod only) and cannot import `@magguarantee/database`, so the DB enum is
 * mirrored here as a Zod enum — same convention as `VehicleDayStateSchema` /
 * `DelegationStatusSchema`. Keep in lockstep with schema.prisma.
 *
 * Semantics (set by the api on the `w_trasie → zjechal` delegation recalc):
 *   - `none`    — no recalc event yet (default), OR a recalc fired but there was
 *                 no real period divergence (so the badge stays silent).
 *   - `applied` — the auto-recalc ran and the period/km-calc were rewritten.
 *   - `skipped` — a recalc was DUE (real divergence between the submitted period
 *                 and the delegation's actual dates) but suppressed because the
 *                 wniosek was already decided OR the period was human-adjusted.
 *
 * The frontend reads this column DIRECTLY (no heuristic inference) to render
 * the «przeliczono» / «wymaga uwagi» badges.
 */
export const ClaimAutoRecalcStateSchema = z.enum(['none', 'applied', 'skipped']);
export type ClaimAutoRecalcState = z.infer<typeof ClaimAutoRecalcStateSchema>;

// ─── Field primitives ────────────────────────────────────

/** `HH:mm` — 00:00 .. 23:59. Empty string ⇒ undefined for form inputs. */
const HhMmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm in 00:00–23:59');

/** Mileage / km values — stored as Decimal(10,2) in DB. */
const MileageSchema = z.number().nonnegative().max(9_999_999);

/**
 * Hours adjustment — non-negative, capped to fit the storage column.
 *
 * Persisted as `Decimal(5,2)` on `Claim.origHoursAdjusted` /
 * `Claim.hoursAdjustedValue`, so the max admissible value is 999.99h
 * (about 41 days — comfortably wider than any realistic single-stop
 * downtime). Tightening the upper bound here means a bad input bounces
 * at the validation pipe with a clean Zod message instead of hitting a
 * Postgres numeric-overflow error.
 */
const HoursAdjustedSchema = z.number().min(0).max(999.99);

// ─── Cross-field date guard (shared by Submit + Preview) ──
//
// GUARD, not a bare comparison: only enforce start <= end when BOTH fields are
// present AND valid ISO dates. The form defaults `dateEnd` to `''`; an empty
// string is "dirty" not "aborted", so a naive `dateStart <= dateEnd` refine
// runs against `''` the moment a start date is picked — and `"2026-06-01" <=
// ""` is always false, firing a spurious error (Bug 1). Skipping when either
// operand fails `z.string().date()` makes the refine a true no-op mid-edit;
// the per-field `IsoDateSchema` already reports a malformed/empty date itself.
const ISO_DATE = z.string().date();
function datesWellOrdered(v: {
  dateStart?: string;
  dateEnd?: string;
}): boolean {
  if (
    v.dateStart === undefined ||
    v.dateEnd === undefined ||
    !ISO_DATE.safeParse(v.dateStart).success ||
    !ISO_DATE.safeParse(v.dateEnd).success
  ) {
    return true; // can't be out of order until both are valid dates
  }
  return v.dateStart <= v.dateEnd;
}

// ─── Submit (carrier creates a wniosek) ──────────────────

// NOTE: `amountRequested` and `hoursAdjusted` are server/verifier-managed and
// are NOT part of the carrier submit body — `amountRequested` is derived from
// km-calc payment server-side, `hoursAdjusted` lives only on the verifier
// `UpdateClaimCorrectionFields` patch below.
/**
 * POST /claims — body shape per docs/13-api-design.md§"Submit claim" and the
 * "everything derives from the wyjazd" principle in docs/20 §0″.
 *
 * Notes:
 * - `carrierId` is **derived from the JWT** — not accepted from the body.
 * - `delegationId` ownership is enforced by `CarrierOwnershipGuard`
 *   (`@CarrierOwns('delegationId', 'body', 'delegationId')`): the outing must
 *   belong to the authenticated carrier.
 * - `vehicleId` / `trailerId` / `driverId` are **NOT** in the carrier submit
 *   body (Phase 7 §0″ finish) — they are DERIVED server-side from the chosen
 *   outing (`Delegation.vehicleId` / `trailerId` / `driverId`, all NOT NULL).
 *   `vehiclePlateSnapshot` comes from `Delegation.vehicle.plateNumber`; the
 *   driver snapshots from the delegation's snapshot columns / driver relation.
 * - `mileage` (legacy `przebieg`) is **NOT** in the carrier submit body — it is
 *   ALWAYS `Σ VehicleDailyKm.km (state=drove)` over the derived period for the
 *   delegation's vehicle. There is no carrier override; `pracownik` revises it
 *   at verification.
 * - `amountRequested` is **NOT** in the carrier submit body — the service
 *   derives it from the km-calc `paymentEur` (rounded to 2 dp). Legacy GAS
 *   allowed a manual override; we don't.
 * - `hoursAdjusted` is **NOT** in the carrier submit body — it is a
 *   verifier-only correction field on `UpdateClaimCorrectionFields`. Submit
 *   always persists `0` in both `origHoursAdjusted` and `hoursAdjustedValue`.
 * - `plannerId`/`opiekunId` are derived server-side from the vehicle's planner
 *   and the carrier's opiekun — clients do not send them.
 * - `timeFrom` / `timeTo` are NOT NULL on the underlying column since
 *   phase3_blocks; the carrier MUST supply them.
 * - `orderNumber` / `orderDate` are intentionally NOT in the submit DTO —
 *   they are MAGTRANS-internal and assigned by the verifier when transitioning
 *   to ZAAKCEPTOWANO. Carrier-side submit always persists NULL.
 */
export const SubmitClaimSchema = z
  .object({
    /**
     * Phase 7 REWORK (2026-06-20 #4, docs/20 §0″) — REQUIRED for new wnioski
     * (app-level). The carrier picks one of their own outings in
     * {`w_trasie`, `zjechal`} that has no claim yet (see
     * `GET /delegations?claimable=true`). The PERIOD, VEHICLE, TRAILER, DRIVER,
     * and MILEAGE are all DERIVED server-side from the chosen outing — the
     * carrier no longer sends `dateStart`/`dateEnd`/`vehicleId`/`trailerId`/
     * `driverId`/`mileage`. The DB FK is `@unique`, so a second wniosek on the
     * same outing 409s.
     */
    delegationId: UuidSchema,

    /**
     * REQUIRED — Claim.timeFrom is NOT NULL since phase3_blocks. The carrier
     * still supplies the time window (the web form pre-fills `timeFrom` from the
     * outing's `departureAt` time); `pracownik` verifies the exact `timeTo`
     * later. km-calc needs both for fractional boundary days.
     */
    timeFrom: HhMmSchema,
    /** REQUIRED — Claim.timeTo is NOT NULL since phase3_blocks. */
    timeTo: HhMmSchema,

    comment: emptyStringToUndefined(z.string().max(2_000).optional()),

    /** Optional pre-uploaded attachment IDs (auth screenshot, photos, etc.). */
    attachmentIds: z.array(UuidSchema).max(20).optional(),
  })
  .strict();
export type SubmitClaimDto = z.infer<typeof SubmitClaimSchema>;

// ─── Preview (server-side live preview) ──────────────────

/**
 * POST /claims/:nrZgl/preview — slim subset of `SubmitClaimSchema` covering
 * just the inputs that affect the km-calc breakdown. Carrier identity and
 * delegation ownership are enforced at the route guard, not the schema.
 *
 * Two callers, two shapes:
 *  - `POST /claims/preview` (carrier new-claim form) — sends `delegationId` and
 *    OMITS `dateStart`/`dateEnd`/`vehicleId`/`mileage`; the api DERIVES the
 *    period + vehicle/trailer/driver + mileage from the outing so the FE can
 *    render them read-only before submit (Phase 7 §0″ finish), and surfaces a
 *    `delegationWarning` when the outing is still `w_trasie`.
 *  - `POST /claims/:nrZgl/preview` (reklamacja / verifier inspection of an
 *    existing claim) — sends the caller-supplied `dateStart`/`dateEnd` (and an
 *    optional `vehicleId`) to drive the live math; the existing claim already
 *    carries the vehicle/trailer/driver context.
 */
export const PreviewClaimSchema = z
  .object({
    /**
     * Phase 7 REWORK (2026-06-20 #4, docs/20 §0″) — OPTIONAL on preview. When
     * the carrier has picked an outing, the form sends `delegationId` and OMITS
     * `dateStart`/`dateEnd`/`vehicleId`/`mileage`; the api derives the PERIOD,
     * VEHICLE, TRAILER, DRIVER, and MILEAGE from the outing (and surfaces a
     * `delegationWarning` when the outing is still `w_trasie`). When absent, the
     * caller-supplied `dateStart`/`dateEnd` (+ optional `vehicleId`) drive the
     * live preview (the existing-claim / verifier inspection path).
     */
    delegationId: emptyStringToUndefined(UuidSchema.optional()),
    /**
     * OPTIONAL — only meaningful on the existing-claim / verifier inspection
     * path (`POST /claims/:nrZgl/preview`). On the carrier new-claim path the
     * vehicle is derived from `delegationId`, so this is omitted there.
     */
    vehicleId: emptyStringToUndefined(UuidSchema.optional()),
    /**
     * OPTIONAL — required only when `delegationId` is absent (the api derives
     * the period from the outing otherwise). The cross-field guard below still
     * orders them when both are present.
     */
    dateStart: emptyStringToUndefined(IsoDateSchema.optional()),
    dateEnd: emptyStringToUndefined(IsoDateSchema.optional()),
    timeFrom: emptyStringToUndefined(HhMmSchema.optional()),
    timeTo: emptyStringToUndefined(HhMmSchema.optional()),
    hoursAdjusted: HoursAdjustedSchema.optional().default(0),
  })
  .strict()
  .refine(datesWellOrdered, {
    // Same stable machine code + dateEnd path as SubmitClaimSchema — see the
    // comment there. Code, not prose: web localizes; api echoes verbatim.
    message: 'date_order',
    path: ['dateEnd'],
  });
export type PreviewClaimDto = z.infer<typeof PreviewClaimSchema>;

// ─── Request authorization (kwota-Maksima e-mail handshake) ──

/**
 * POST /claims/:nrZgl/request-authorization — Phase 4.2.
 *
 * Triggered by admin / pracownik when a verified claim's payout amount
 * exceeds the wniosek's `amountRequested` and needs Maksim's sign-off
 * before being booked as accepted. Transitions the claim into
 * `OCZEKUJE_NA_AUTORYZACJE`, stamps a fresh `authorizationToken` (UUID v4),
 * stores the override amount in `Claim.amountMaximum`, and dispatches an
 * email to Maksim with the deeplink + summary (Mailhog in dev, Gmail in
 * Phase 9).
 *
 * Fields:
 *  - `kwotaMaksima` — verifier-requested authorization amount in EUR. Stored
 *    verbatim into `Claim.amountMaximum` (Decimal(12,2)). Must be positive
 *    and a multiple of 0.01 so the Decimal column round-trips cleanly.
 *  - `comment` — optional rationale shown in the email body and persisted
 *    into `Claim.authorizationDescription`.
 *
 * The PATCH /claims/:nrZgl path also accepts an optional `amountMaximum`
 * field for the accepted-status branch. The PATCH variant is for *direct
 * override during acceptance* without going through the Maksim handshake;
 * this endpoint is for *requesting* the handshake. Two callers, two paths.
 */
export const RequestAuthorizationSchema = z
  .object({
    kwotaMaksima: z.number().positive().multipleOf(0.01).max(9_999_999),
    comment: emptyStringToUndefined(
      z.string().trim().min(1).max(2_000).optional(),
    ),
  })
  .strict();
export type RequestAuthorizationDto = z.infer<typeof RequestAuthorizationSchema>;

// ─── Reklamacja ──────────────────────────────────────────

/**
 * POST /claims/:nrZgl/reklamacja — a carrier disputes a decided claim.
 * `kwotaReklamacji` is the new amount the carrier is now asking for.
 */
export const SubmitReklamacjaSchema = z
  .object({
    tresc: z.string().min(1).max(4_000),
    kwotaReklamacji: z.number().nonnegative().max(9_999_999),
  })
  .strict();
export type SubmitReklamacjaDto = z.infer<typeof SubmitReklamacjaSchema>;

// ─── km-calc breakdown row (mirror of MonthBreakdown in domain/km-calc) ──

/**
 * Wire shape for one month in the breakdown column on `Claim.breakdown`
 * (Json) and as returned by `/preview`. Matches the `MonthBreakdown`
 * interface in `domain/km-calc.ts` — kept as a separate Zod schema so
 * the wire contract is independent of the engine's TS types.
 *
 * The TS type alias here is `MonthBreakdownDto` to avoid colliding with
 * the engine's `MonthBreakdown` interface which is also re-exported
 * from `@magguarantee/shared`.
 */
/**
 * One holiday / EU heavy-vehicle ban day that was dropped from this month's
 * working-day count. Weekends are deliberately NOT included — they're
 * universal and would dominate the list. Matches `ExcludedDay` in
 * `domain/km-calc.ts`.
 */
export const ExcludedDaySchema = z.object({
  date: IsoDateSchema,
  label: z.string().min(1).max(120),
});
export type ExcludedDayDto = z.infer<typeof ExcludedDaySchema>;

export const MonthBreakdownSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  workingDays: z.number().nonnegative(),
  kmPerDay: z.number().nonnegative(),
  ratePerKm: z.number().nonnegative(),
  kmInMonth: z.number().nonnegative(),
  // Optional + default so old persisted `Claim.breakdown` JSONB rows (which
  // pre-date this field) still parse cleanly. New rows always include it.
  excludedDays: z.array(ExcludedDaySchema).default([]),
});
export type MonthBreakdownDto = z.infer<typeof MonthBreakdownSchema>;

/**
 * Wire shape for the full km-calc envelope (persisted JSONB on
 * `Claim.breakdown`, returned by `/preview` and `/claims/:nrZgl`).
 *
 * `rawTotalDays` is the pre-`hoursAdjusted` total (engine surfaces this so
 * the UI can render `<HoursReadout>` with both raw and adjusted hours per
 * docs/14-design-system.md §"Phase 3.1"). Legacy `Claim.breakdown` JSONB
 * rows written before this field existed do NOT carry the key — the
 * trailing `.transform()` backfills `rawTotalDays = totalDays` so the UI
 * cleanly collapses to a single-value readout (the "no adjustment" path).
 *
 * Zod 3 cannot reference sibling fields from inside `.default(...)` (the
 * default callback receives no args), so the missing-field fallback has to
 * live in a post-parse transform rather than the field schema itself.
 */
export const KmCalcBreakdownSchema = z
  .object({
    totalDays: z.number().nonnegative(),
    rawTotalDays: z.number().nonnegative().optional(),
    kmGuaranteed: z.number().nonnegative(),
    ratePerKmEffective: z.number().nonnegative(),
    breakdown: z.array(MonthBreakdownSchema),
  })
  .transform((v) => ({
    ...v,
    rawTotalDays: v.rawTotalDays ?? v.totalDays,
  }));
export type KmCalcBreakdown = z.infer<typeof KmCalcBreakdownSchema>;

// ─── Delegation warning code (soft, Phase 7 REWORK 2026-06-20 #4) ──

/**
 * Soft-warning code surfaced when a carrier previews/submits a wniosek against
 * an outing that is still `w_trasie` (not yet `zjechal`). The submit is NOT
 * blocked — the carrier may proceed (period falls back to `plannedReturnAt`,
 * and a later `zjechal` triggers the auto-recalc). The web carrier form renders
 * a confirmation banner from this code. Submitting from `gotowy` / `zgloszony`
 * is a hard 422, NOT this soft flag.
 */
export const DELEGATION_NOT_YET_RETURNED_WARNING = 'NOT_YET_RETURNED' as const;
export const DelegationWarningSchema = z.enum([
  DELEGATION_NOT_YET_RETURNED_WARNING,
]);
export type DelegationWarning = z.infer<typeof DelegationWarningSchema>;

// ─── Preview response ────────────────────────────────────

/**
 * Read-only vehicle/trailer/driver context DERIVED from the chosen outing on
 * the carrier new-claim preview path (Phase 7 §0″ finish). The carrier no
 * longer types these; the web form renders them read-only from this block so
 * the carrier sees exactly what the submit will persist. Absent on the
 * existing-claim / verifier inspection path (no `delegationId`).
 */
export const PreviewDelegationContextSchema = z.object({
  vehicleId: UuidSchema,
  vehiclePlate: z.string(),
  trailerId: UuidSchema,
  trailerPlate: z.string().nullable(),
  driverId: UuidSchema,
  /** Driver display name — delegation snapshot, falling back to the relation. */
  driverName: z.string().nullable(),
});
export type PreviewDelegationContext = z.infer<
  typeof PreviewDelegationContextSchema
>;

export const PreviewClaimResponseSchema = z.object({
  /**
   * Effective mileage used for the preview math. On the carrier new-claim path
   * (a `delegationId` was supplied) this is ALWAYS the server-computed
   * `Σ VehicleDailyKm.km (state=drove)` over the derived period for the
   * delegation's vehicle (Phase 7 §0″ finish — no carrier override). On the
   * existing-claim / verifier inspection path it falls back to the
   * caller-supplied dates' vehicle sum. The web form renders the read-only
   * mileage field from this.
   */
  mileage: z.number().nonnegative(),
  kmGuaranteed: z.number().nonnegative(),
  kmDifference: z.number(), // can be negative if mileage > guaranteed
  paymentEur: z.number().nonnegative(),
  ratePerKmEffective: z.number().nonnegative(),
  breakdown: KmCalcBreakdownSchema,
  /**
   * Phase 7 REWORK (2026-06-20 #4) — derived period boundaries when the preview
   * was computed from a `delegationId` (so the carrier form can show the
   * read-only period it will submit). Absent on the legacy date-driven preview.
   */
  dateStart: IsoDateSchema.optional(),
  dateEnd: IsoDateSchema.optional(),
  /**
   * Soft warning — present (= `NOT_YET_RETURNED`) when the previewed outing is
   * still `w_trasie`. The carrier may still proceed; the web renders a confirm
   * banner. Absent on a `zjechal` outing or the legacy date-driven preview.
   */
  delegationWarning: DelegationWarningSchema.optional(),
  /**
   * Read-only vehicle/trailer/driver derived from the chosen outing (Phase 7
   * §0″ finish). Present only on the delegation-derived path so the carrier
   * form can render these fields read-only. Absent on the existing-claim /
   * verifier inspection path.
   */
  delegationContext: PreviewDelegationContextSchema.optional(),
});
export type PreviewClaimResponse = z.infer<typeof PreviewClaimResponseSchema>;

// ─── Filters (list / cursor pagination) ──────────────────

export const ClaimFiltersSchema = z
  .object({
    status: ClaimStatusSchema.optional(),
    carrierId: UuidSchema.optional(),
    vehicleId: UuidSchema.optional(),
    /** ISO date — match claims whose `dateStart` is on or after. */
    from: IsoDateSchema.optional(),
    /** ISO date — match claims whose `dateEnd` is on or before. */
    to: IsoDateSchema.optional(),
    q: z.string().min(1).max(64).optional(),
    /** Cursor is the `nrZgl` of the previous page tail (string, not UUID). */
    cursor: z.string().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type ClaimFilters = z.infer<typeof ClaimFiltersSchema>;

// ─── Mini-references (vehicle / carrier / user) ──────────

const CarrierMiniSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
});

const VehicleMiniSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
});

const UserMiniSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
});

const ClaimAttachmentDtoSchema = z.object({
  id: UuidSchema,
  url: z.string(),
  mimeType: z.string().nullable(),
  size: z.number().int().nonnegative().nullable(),
  uploadedById: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type ClaimAttachmentDto = z.infer<typeof ClaimAttachmentDtoSchema>;

// ─── Full Claim DTO (response) ───────────────────────────

/**
 * Full Claim record returned by `GET /claims/:nrZgl` and `POST /claims`.
 * Mirrors the shape persisted by Prisma `Claim` — Decimal columns surface
 * as numbers on the wire (the API layer narrows them).
 */
export const ClaimDtoSchema = z.object({
  id: UuidSchema,
  nrZgl: z.string(),

  carrierId: UuidSchema,
  carrier: CarrierMiniSchema.nullable(),

  vehicleId: UuidSchema.nullable(),
  vehicle: VehicleMiniSchema.nullable(),
  vehiclePlateSnapshot: z.string(),

  dateStart: IsoDateTimeSchema,
  dateEnd: IsoDateTimeSchema,
  // NOT NULL after phase3_blocks.
  timeFrom: z.string(),
  timeTo: z.string(),

  // All calc columns are NOT NULL after phase3_blocks.
  drivenDays: z.number(),
  mileage: z.number(),
  kmPerDay: z.number(),
  kmGuaranteed: z.number(),
  kmDifference: z.number(),
  paymentEur: z.number(),
  ratePerKmEffective: z.number(),
  breakdown: KmCalcBreakdownSchema.nullable(),

  status: ClaimStatusSchema,
  statusChangedAt: IsoDateTimeSchema.nullable(),
  decidedById: UuidSchema.nullable(),
  decidedBy: UserMiniSchema.nullable(),

  comment: z.string().nullable(),
  orderNumber: z.string().nullable(),
  orderDate: IsoDateSchema.nullable(),

  authorizationRequired: z.boolean(),
  authorizationDescription: z.string().nullable(),
  authorizationToken: z.string().nullable(),
  authorizationDecidedAt: IsoDateTimeSchema.nullable(),

  // amountRequested is NOT NULL in DB since phase3_blocks_audit_revert
  // (carrier always supplies it at submit).
  amountRequested: z.number(),
  amountApproved: z.number().nullable(),
  margin: z.number().nullable(),
  amountMaximum: z.number().nullable(),

  reklamacjaSubmitted: z.boolean(),
  reklamacjaText: z.string().nullable(),
  reklamacjaResponse: z.string().nullable(),
  reklamacjaAmount: z.number().nullable(),
  statusBeforeReklamacja: ClaimStatusSchema.nullable(),
  origDateStart: IsoDateTimeSchema.nullable(),
  origDateEnd: IsoDateTimeSchema.nullable(),
  origMileage: z.number().nullable(),
  /**
   * Immutable carrier snapshot of the claimed time window (`HH:mm` strings),
   * captured once at submit alongside `origDateStart/origDateEnd/origMileage`.
   * Write-once: the verifier PATCH (which mutates `timeFrom/timeTo`) never
   * touches these, so the History tab / audit trail can show the carrier's
   * originally-claimed time window next to the current applied value.
   */
  origTimeFrom: z.string().nullable(),
  origTimeTo: z.string().nullable(),
  /**
   * Immutable carrier snapshot of the hours-adjustment value at submit time.
   * Written once when the claim is created and never modified after — pairs
   * with the other `orig*` fields above so the History tab / audit trail can
   * show "carrier originally claimed X" alongside the current applied value.
   */
  origHoursAdjusted: z.number().nullable(),
  /**
   * Currently applied hours-adjustment value — drives km-calc
   * (`korektaDni = hoursAdjustedValue / 24`). Starts equal to
   * `origHoursAdjusted` at submit; verifier PATCH mutates this column.
   */
  hoursAdjustedValue: z.number().nullable(),

  authScreenshotUrl: z.string().nullable(),
  attachments: z.array(ClaimAttachmentDtoSchema),

  /**
   * Phase 7 REWORK (2026-06-20 #4) — the outing this wniosek was filed against.
   * `@unique` FK → Delegation. Nullable on the wire for legacy/pre-rework rows;
   * always set for new wnioski.
   */
  delegationId: UuidSchema.nullable(),
  /**
   * Set to `true` once a pracownik PATCHes `dateStart`/`dateEnd` — the boundary
   * that DISABLES the auto-recalc when the linked outing later transitions to
   * `zjechal` (a human-corrected period is never silently overwritten).
   */
  periodAdjustedByVerifier: z.boolean(),
  /**
   * Explicit, stored result of the `w_trasie → zjechal` auto-recalc — read
   * DIRECTLY by the frontend (no heuristic inference). `none` until a recalc
   * event with a real period divergence occurs; `applied` when the recalc
   * rewrote the period/km-calc; `skipped` when a recalc was due but suppressed
   * (claim already decided OR period human-adjusted). See
   * `ClaimAutoRecalcStateSchema`.
   */
  autoRecalcState: ClaimAutoRecalcStateSchema,

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ClaimDto = z.infer<typeof ClaimDtoSchema>;

// ─── Slim list-item DTO ──────────────────────────────────

/**
 * Compact projection used by `GET /claims` lists — keeps payloads small
 * for table views. Exposes the carrier-relevant flags so the UI can show
 * status pills and reklamacja chevrons without a second round-trip.
 */
export const ClaimListItemSchema = z.object({
  id: UuidSchema,
  nrZgl: z.string(),
  status: ClaimStatusSchema,
  carrierId: UuidSchema,
  carrierName: z.string().nullable(),
  vehiclePlate: z.string(),
  dateStart: IsoDateTimeSchema,
  dateEnd: IsoDateTimeSchema,
  // Calculation fields are NOT NULL post-phase3_blocks.
  drivenDays: z.number(),
  mileage: z.number(),
  kmGuaranteed: z.number(),
  kmDifference: z.number(),
  paymentEur: z.number(),
  amountRequested: z.number(),
  amountApproved: z.number().nullable(),
  authorizationRequired: z.boolean(),
  reklamacjaSubmitted: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type ClaimListItem = z.infer<typeof ClaimListItemSchema>;

// ─── Update claim — discriminated union by `targetStatus` ──
//
// The endpoint `PATCH /claims/:nrZgl` ships in Phase 4. The schema is
// defined here so the contract is locked early and the future Service-level
// type is wired through `ClaimsService.decide` (which currently throws
// NotImplemented).
//
// Each variant carries the fields required for that single transition.
// Legal transitions follow docs/04-data-model.md and Code.gs:5180-5345.
// Notice that `REKLAMACJA → *` is reachable only by the verifier — the
// carrier files a reklamacja via the dedicated POST /claims/:nrZgl/reklamacja.

const UpdateClaimAmountSchema = z.number().nonnegative().max(9_999_999);
const UpdateClaimMarginSchema = z.number().min(-9_999_999).max(9_999_999);
const UpdateClaimCommentSchema = z.string().min(1).max(4_000);

/** Common optional corrections — verifier can tweak the carrier's submission. */
const UpdateClaimCorrectionFields = {
  dateStart: emptyStringToUndefined(IsoDateSchema.optional()),
  dateEnd: emptyStringToUndefined(IsoDateSchema.optional()),
  timeFrom: emptyStringToUndefined(HhMmSchema.optional()),
  timeTo: emptyStringToUndefined(HhMmSchema.optional()),
  mileage: MileageSchema.optional(),
  hoursAdjusted: HoursAdjustedSchema.optional(),
} as const;

/** NA_WERYFIKACJI → OCZEKUJE_NA_AUTORYZACJĘ — large-amount path. */
const UpdateClaimToAuthorizationPending = z
  .object({
    targetStatus: z.literal('OCZEKUJE_NA_AUTORYZACJE'),
    margin: UpdateClaimMarginSchema,
    authorizationDescription: z.string().min(1).max(4_000),
    ...UpdateClaimCorrectionFields,
  })
  .strict();

/** NA_WERYFIKACJI → ZAAKCEPTOWANO  /  OCZEKUJE_NA_AUTORYZACJE → ZAAKCEPTOWANO. */
const UpdateClaimToAccepted = z
  .object({
    targetStatus: z.literal('ZAAKCEPTOWANO'),
    /** REQUIRED — needed by the CHECK constraint at DB level. */
    orderNumber: z.string().min(1).max(64),
    /** REQUIRED — needed by the CHECK constraint at DB level. */
    orderDate: IsoDateSchema,
    /** REQUIRED — needed by the CHECK constraint at DB level. */
    amountApproved: UpdateClaimAmountSchema,
    /** Maksim authorization override — optional, only relevant after OCZEKUJE_*. */
    // Phase 4.2: kwotaMaksima override — admin/pracownik tylko, mapuje na Claim.amountMaximum.
    amountMaximum: UpdateClaimAmountSchema.optional(),
    comment: emptyStringToUndefined(z.string().max(4_000).optional()),
    ...UpdateClaimCorrectionFields,
  })
  .strict();

/** NA_WERYFIKACJI → ODRZUCONO  /  OCZEKUJE_NA_AUTORYZACJE → ODRZUCONO. */
const UpdateClaimToRejected = z
  .object({
    targetStatus: z.literal('ODRZUCONO'),
    /** REQUIRED — rejection reason. */
    comment: UpdateClaimCommentSchema,
  })
  .strict();

/** REKLAMACJA → ZAAKCEPTOWANO — verifier accepts the dispute. */
const UpdateClaimReklamacjaAccepted = z
  .object({
    targetStatus: z.literal('REKLAMACJA_ZAAKCEPTOWANO'),
    /** REQUIRED — verifier reasoning recorded in the audit log. */
    comment: UpdateClaimCommentSchema,
    /** REQUIRED — `zatwKwota` value the verifier approved. */
    reklamacjaAmount: UpdateClaimAmountSchema,
    ...UpdateClaimCorrectionFields,
  })
  .strict();

/** REKLAMACJA → ODRZUCONO — verifier rejects the dispute. */
const UpdateClaimReklamacjaRejected = z
  .object({
    targetStatus: z.literal('REKLAMACJA_ODRZUCONO'),
    /** REQUIRED — rejection reason. */
    comment: UpdateClaimCommentSchema,
  })
  .strict();

/**
 * PATCH /claims/:nrZgl — discriminated by `targetStatus`. The synthetic
 * `REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO` literals are wire-only
 * — the service translates them to `ZAAKCEPTOWANO` / `ODRZUCONO` (with a
 * mirror to `statusBeforeReklamacja`) before persisting.
 */
export const UpdateClaimSchema = z.discriminatedUnion('targetStatus', [
  UpdateClaimToAuthorizationPending,
  UpdateClaimToAccepted,
  UpdateClaimToRejected,
  UpdateClaimReklamacjaAccepted,
  UpdateClaimReklamacjaRejected,
]);
export type UpdateClaimDto = z.infer<typeof UpdateClaimSchema>;
