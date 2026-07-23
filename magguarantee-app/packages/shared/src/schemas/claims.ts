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
import { DelegationStatusSchema } from './delegations';

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
 * - `timeFrom` / `timeTo` are **NOT** in the carrier submit body — they are
 *   DERIVED server-side from the outing's actual times: `timeFrom` is the
 *   wall-clock `HH:mm` of `Delegation.actualDepartureAt` and `timeTo` of
 *   `Delegation.actualReturnAt` (the weryfikator captures both as full
 *   datetimes on the `w_trasie` / `zjechal` transitions). The carrier no longer
 *   supplies a time window; `pracownik` may still override it at verification
 *   (`VerifyClaimSchema` / `UpdateClaimCorrectionFields`). Both columns stay
 *   NOT NULL — submit always writes the derived values.
 * - `orderNumber` / `orderDate` are intentionally NOT in the submit DTO —
 *   they are MAGTRANS-internal and assigned by the verifier when transitioning
 *   to ZAAKCEPTOWANO. Carrier-side submit always persists NULL.
 */
export const SubmitClaimSchema = z
  .object({
    /**
     * Phase 7 REWORK (2026-06-20 #4, docs/20 §0″) — REQUIRED for new wnioski
     * (app-level). The carrier picks one of their own `zjechal` outings that has
     * no claim yet (see `GET /delegations?claimable=true`). The PERIOD, TIMES,
     * VEHICLE, TRAILER, DRIVER, and MILEAGE are all DERIVED server-side from the
     * chosen (returned) outing — the carrier no longer sends `dateStart`/
     * `dateEnd`/`timeFrom`/`timeTo`/`vehicleId`/`trailerId`/`driverId`/`mileage`.
     * The DB FK is `@unique`, so a second wniosek on the same outing 409s.
     */
    delegationId: UuidSchema,

    // `timeFrom` / `timeTo` are NO LONGER carrier-supplied — they are DERIVED
    // server-side from the outing's `actualDepartureAt` / `actualReturnAt`
    // wall-clock (see the schema doc above). The carrier submit body is now just
    // the outing reference + optional comment/attachments.

    comment: emptyStringToUndefined(z.string().max(2_000).optional()),

    /** Optional pre-uploaded attachment IDs (auth screenshot, photos, etc.). */
    attachmentIds: z.array(UuidSchema).max(20).optional(),
  })
  .strict();
export type SubmitClaimDto = z.infer<typeof SubmitClaimSchema>;

// ─── Verify (pracownik verification checkpoint) ──────────

/**
 * PATCH /claims/:nrZgl/verification — the verifier's «Zapisz weryfikację»
 * checkpoint per docs/13-api-design.md#claims.
 *
 * Product decision (final): a `pracownik` (or `admin`) persists their
 * corrections to a claim in status `NA_WERYFIKACJI` via this checkpoint BEFORE
 * making any decision. The decision transitions (akceptacja / odmowa) and the
 * kwota-Maksima authorization request FROM `NA_WERYFIKACJI` are then GATED
 * (422 `CLAIM_NOT_VERIFIED`) until the claim carries a `verifiedAt` stamp.
 * Transitions FROM `OCZEKUJE_NA_AUTORYZACJE` and `REKLAMACJA` are NOT gated.
 *
 * Body — the SAME optional correction fields as the verifier PATCH's
 * `UpdateClaimCorrectionFields` (dates / times / mileage / hoursAdjusted). An
 * EMPTY body is LEGAL — it means "confirmed as-is": the service simply stamps
 * `verifiedAt`/`verifiedById` without re-running km-calc. When correction
 * fields are present the service re-runs the SAME `KmCalcService` engine and
 * persists the fresh outputs, exactly like the decision PATCH's recalc.
 *
 * The delegation `w_trasie → zjechal` auto-recalc INVALIDATES the checkpoint
 * (resets `verifiedAt`/`verifiedById` to NULL) because the underlying data
 * changed — the verifier must re-confirm. Repeatable: a second call overwrites
 * the previous stamp + corrections. `.strict()` — no stray keys.
 */
export const VerifyClaimSchema = z
  .object({
    dateStart: emptyStringToUndefined(IsoDateSchema.optional()),
    dateEnd: emptyStringToUndefined(IsoDateSchema.optional()),
    timeFrom: emptyStringToUndefined(HhMmSchema.optional()),
    timeTo: emptyStringToUndefined(HhMmSchema.optional()),
    mileage: MileageSchema.optional(),
    hoursAdjusted: HoursAdjustedSchema.optional(),
  })
  .strict();
export type VerifyClaimDto = z.infer<typeof VerifyClaimSchema>;

// ─── Preview (server-side live preview) ──────────────────

/**
 * POST /claims/:nrZgl/preview — slim subset of `SubmitClaimSchema` covering
 * just the inputs that affect the km-calc breakdown. Carrier identity and
 * delegation ownership are enforced at the route guard, not the schema.
 *
 * Two callers, two shapes:
 *  - `POST /claims/preview` (carrier new-claim form) — sends `delegationId` and
 *    OMITS `dateStart`/`dateEnd`/`vehicleId`/`mileage`; the api DERIVES the
 *    period + times + vehicle/trailer/driver + mileage from the outing so the FE
 *    can render them read-only before submit (Phase 7 §0″ finish). The outing
 *    must already be `zjechal` (a wniosek can only back a returned outing).
 *  - `POST /claims/:nrZgl/preview` (reklamacja / verifier inspection of an
 *    existing claim) — sends the caller-supplied `dateStart`/`dateEnd` (and an
 *    optional `vehicleId`) to drive the live math; the existing claim already
 *    carries the vehicle/trailer/driver context. A VERIFIER (`pracownik` /
 *    `admin`) may additionally send `mileage` to override the daily-km sum in
 *    the preview (matches the PATCH correction field); a `przewoznik`
 *    reklamacja inspection has this override IGNORED by the api. On the
 *    `delegationId` (new-claim) path `mileage` is ALWAYS ignored.
 */
export const PreviewClaimSchema = z
  .object({
    /**
     * Phase 7 REWORK (2026-06-20 #4, docs/20 §0″) — OPTIONAL on preview. When
     * the carrier has picked an outing, the form sends `delegationId` and OMITS
     * `dateStart`/`dateEnd`/`vehicleId`/`mileage`; the api derives the PERIOD,
     * TIMES, VEHICLE, TRAILER, DRIVER, and MILEAGE from the outing (which must be
     * `zjechal`) — any body `timeFrom`/`timeTo` here are IGNORED. When absent, the
     * caller-supplied `dateStart`/`dateEnd` (+ optional `vehicleId`) drive the
     * live preview (the existing-claim / verifier inspection path); a verifier may
     * additionally supply `timeFrom`/`timeTo` to live-recalc an unsaved time edit,
     * else the persisted claim's times are used.
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
    /**
     * VERIFIER inspection-path override — only honoured on
     * `POST /claims/:nrZgl/preview` when the caller is a verifier role
     * (`pracownik` / `admin`). When present it drives the live km-calc so the
     * ClaimModal's dopłata / HoursReadout track a pracownik's UNSAVED time edit
     * before the PATCH commits (mirrors the sibling `mileage` override — same
     * `allowMileageOverride` gate). When omitted, the api falls back to the
     * persisted claim's `timeFrom`/`timeTo`.
     *
     * The CARRIER new-claim path (`delegationId` present) ALWAYS IGNORES these —
     * the times are DERIVED from the outing's `actualDepartureAt`/`actualReturnAt`
     * (the carrier never influences the time window, not even in preview). A
     * `przewoznik` reklamacja inspection likewise has them ignored. Kept optional
     * so both callers share one wire shape. NOT part of `SubmitClaimSchema` — on
     * submit the times are always outing-derived. Empty string → undefined.
     */
    timeFrom: emptyStringToUndefined(HhMmSchema.optional()),
    timeTo: emptyStringToUndefined(HhMmSchema.optional()),
    /**
     * VERIFIER inspection-path override — only meaningful on
     * `POST /claims/:nrZgl/preview` when the caller is a verifier role
     * (`pracownik` / `admin`). When present, it replaces the server-computed
     * `Σ VehicleDailyKm.km (state=drove)` in the live preview so the ClaimModal's
     * dopłata / RecalcBadge / accept-gate / auto-populated `amountApproved` all
     * track a km edit before the PATCH commits — mirroring what the PATCH recalc
     * will persist (`UpdateClaimCorrectionFields.mileage`).
     *
     * The CARRIER new-claim path (`delegationId` present, or `przewoznik`
     * reklamacja inspection) IGNORES this field: mileage there is ALWAYS the
     * daily-km sum — the "no carrier override" invariant from Phase 7 §0″ stands.
     * The api enforces the gate (`allowMileageOverride` off the caller's role);
     * the schema keeps it optional so both callers share one wire shape. Empty
     * string → undefined (form-friendly) via the same preprocessor the sibling
     * fields use — a cleared numeric input never reaches `.nonnegative()`.
     */
    mileage: emptyStringToUndefined(MileageSchema.optional()),
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
 * and dispatches an email to Maksim with the deeplink + summary (Mailhog in
 * dev, Gmail in Phase 9).
 *
 * Product decision (final): the request DOES NOT carry an amount. Maksim
 * hasn't decided anything at request time, so entering a "kwota Maksima"
 * up-front is semantically wrong (legacy `Code.gs:6010 sendAuthorizationRequest`
 * also sent no amount). `Claim.amountMaximum` is recorded LATER — after
 * Maksim replies — via `PUT /claims/:nrZgl/authorization-amount`
 * (`SetAuthorizationAmountSchema`), while the claim sits in
 * `OCZEKUJE_NA_AUTORYZACJE`.
 *
 * Fields:
 *  - `comment` — REQUIRED rationale ("opis sprawy") shown in the email body
 *    to Maksim and persisted into `Claim.authorizationDescription`. Trimmed,
 *    non-empty, max 2 000 chars. `RequestAuthorizationDto.comment` is `string`
 *    (never `undefined`) — the caller MUST provide a description.
 *
 * The PATCH /claims/:nrZgl path also accepts an optional `amountMaximum`
 * field for the accepted-status branch. The PATCH variant is for *direct
 * override during acceptance*; the dedicated `authorization-amount` endpoint
 * is for *recording Maksim's replied amount* while pending. This endpoint is
 * for *requesting* the handshake — three callers, three paths.
 */
export const RequestAuthorizationSchema = z
  .object({
    comment: z.string().trim().min(1).max(2_000),
  })
  .strict();
export type RequestAuthorizationDto = z.infer<typeof RequestAuthorizationSchema>;

/**
 * PUT /claims/:nrZgl/authorization-amount — Phase 4.2 (kwota-Maksima follow-up).
 *
 * Records the amount Maksim assigned in his EMAIL REPLY. Called by admin /
 * pracownik AFTER `request-authorization` has fired the request email, while
 * the claim sits in `OCZEKUJE_NA_AUTORYZACJE`. Maps verbatim to
 * `Claim.amountMaximum` (Decimal(12,2)) — hence the positive / `multipleOf(0.01)`
 * constraint so the column round-trips cleanly. Allowed ONLY while the claim
 * is pending authorization; may be called again to CORRECT the value (Maksim
 * revised his reply). No email — this is a pure amount record.
 *
 * NOTE: `amountMaximum` no longer means "requested amount"; it now means the
 * "kwota przyznana/wskazana przez Maksima" recorded from his reply.
 */
export const SetAuthorizationAmountSchema = z
  .object({
    kwotaMaksima: z.number().positive().multipleOf(0.01).max(9_999_999),
  })
  .strict();
export type SetAuthorizationAmountDto = z.infer<
  typeof SetAuthorizationAmountSchema
>;

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
  // WEEKDAY days only (Mon–Fri, post EU-ban / fraction / hoursAdjusted).
  // Total days for the month = `workingDays + saturdaysCounted`.
  workingDays: z.number().nonnegative(),
  kmPerDay: z.number().nonnegative(),
  ratePerKm: z.number().nonnegative(),
  // Odd-Saturday guarantee fields — `.optional().default(0)` so old persisted
  // `Claim.breakdown` JSONB rows (written before the feature) parse cleanly and
  // backfill to 0. New rows always include them. Mirror of `MonthBreakdown` in
  // `domain/km-calc.ts`.
  /** Whole qualifying ("odd") Saturdays credited this month (integer, ≥0). */
  saturdaysCounted: z.number().nonnegative().default(0),
  /** Guarantee km per qualifying Saturday applied this month (`0` = feature OFF). */
  kmPerSaturday: z.number().nonnegative().default(0),
  /** km guaranteed from Saturdays this month (= round(saturdaysCounted * kmPerSaturday)). */
  kmFromSaturdays: z.number().nonnegative().default(0),
  // Grand-total km guaranteed for the month = round(workingDays*kmPerDay) + kmFromSaturdays.
  kmInMonth: z.number().nonnegative(),
  /**
   * ISO dates of the CREDITED qualifying Saturdays this month (ascending).
   * Mirror of `MonthBreakdown.saturdayDays` in `domain/km-calc.ts`; symmetric
   * with `excludedDays` (a qualifying Saturday on a ban is in `excludedDays`,
   * not here). `.default([])` so old persisted `Claim.breakdown` JSONB rows
   * (written before the feature) parse cleanly. `IsoDateSchema` — same as
   * `ExcludedDaySchema.date`.
   */
  saturdayDays: z.array(IsoDateSchema).default([]),
  // Optional + default so old persisted `Claim.breakdown` JSONB rows (which
  // pre-date this field) still parse cleanly. New rows always include it.
  excludedDays: z.array(ExcludedDaySchema).default([]),
});
export type MonthBreakdownDto = z.infer<typeof MonthBreakdownSchema>;

/**
 * The claim period's boundary calendar day + the fraction of it actually
 * credited (0..1, 2-dp). Mirror of `KmCalcResult.firstDay` / `.lastDay` in
 * `domain/km-calc.ts`. `0` when the boundary day was excluded (Sunday /
 * EU-ban weekday / non-qualifying or feature-off Saturday); `1` for a counted
 * whole day or a counted qualifying Saturday; the time-based fraction for a
 * counted weekday. This is the RAW credited fraction, BEFORE the month-level
 * `hoursAdjusted` distribution.
 */
export const BoundaryDaySchema = z.object({
  date: IsoDateSchema,
  fraction: z.number(),
});
export type BoundaryDayDto = z.infer<typeof BoundaryDaySchema>;

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
 * `firstDay` / `lastDay` carry the credited fraction of the period's boundary
 * calendar days so the "Miesiąc" breakdown block can show exactly how much of
 * the first / last day was counted without re-deriving the calendar walk
 * client-side. `.nullable().optional()` (default `null`) so legacy persisted
 * `Claim.breakdown` rows written before this field existed still parse — new
 * rows always include them, and a valid range always reports a non-null object
 * (an excluded boundary day reports `fraction: 0`, not `null`; `null` is
 * reserved for the invalid/empty-range engine path).
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
    firstDay: BoundaryDaySchema.nullable().optional().default(null),
    lastDay: BoundaryDaySchema.nullable().optional().default(null),
  })
  .transform((v) => ({
    ...v,
    rawTotalDays: v.rawTotalDays ?? v.totalDays,
  }));
export type KmCalcBreakdown = z.infer<typeof KmCalcBreakdownSchema>;

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
   * Derived time window (`HH:mm`) when the preview was computed from a
   * `delegationId` — the wall-clock `HH:mm` of the outing's `actualDepartureAt`
   * / `actualReturnAt` (falling back to `departureAt` / `plannedReturnAt`). The
   * carrier form renders these READ-ONLY alongside the derived period (the
   * carrier no longer types a time window). Absent on the existing-claim /
   * verifier date-driven preview.
   */
  timeFrom: HhMmSchema.optional(),
  timeTo: HhMmSchema.optional(),
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

/**
 * Category of a Claim attachment, mirroring the DB `enum
 * ClaimAttachmentCategory`:
 *  - `WNIOSEK`            — a regular wniosek attachment (default / backfill).
 *  - `AUTORYZACJA_MAKSIMA` — the screenshot of Maksim's out-of-band
 *    confirmation that lifts the over-threshold authorization gate on a
 *    verified claim.
 * Order mirrors the DB enum `{WNIOSEK, AUTORYZACJA_MAKSIMA}`.
 */
export const ClaimAttachmentCategorySchema = z.enum([
  'WNIOSEK',
  'AUTORYZACJA_MAKSIMA',
]);
export type ClaimAttachmentCategory = z.infer<
  typeof ClaimAttachmentCategorySchema
>;

const ClaimAttachmentDtoSchema = z.object({
  id: UuidSchema,
  /**
   * Distinguishes the Maksim confirmation screenshot (`AUTORYZACJA_MAKSIMA`)
   * from regular wniosek attachments (`WNIOSEK`, the default). The web filters
   * on this to render the "potwierdzenie autoryzacji" chip.
   */
  category: ClaimAttachmentCategorySchema,
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

  /**
   * Verification checkpoint (pracownik «Zapisz weryfikację»). `verifiedAt` is
   * the timestamp the verifier confirmed the claim's data (with or without
   * corrections); `verifiedById`/`verifiedBy` identify who — mirror of the
   * `decidedBy` conventions above. `null` when the claim has not been verified
   * yet (or the delegation auto-recalc invalidated a prior checkpoint because
   * the underlying data changed). The frontend reads these to gate the decision
   * actions and render "zweryfikowano przez X" in the ClaimModal.
   */
  verifiedAt: IsoDateTimeSchema.nullable(),
  verifiedById: UuidSchema.nullable(),
  verifiedBy: UserMiniSchema.nullable(),

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
   * Immutable submit-time snapshot of the km-calc payment (`paymentEur` at
   * create). Write-once alongside the other `orig*` fields — the verifier PATCH
   * / checkpoint recalc never touches it, so the authorization-email diff and
   * the History tab can show the carrier's originally-derived dopłata next to
   * the currently-applied amount. `null` for legacy rows created before this
   * column existed.
   */
  origPaymentEur: z.number().nullable(),
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

  /**
   * Maksim authorization gate (ADDITIVE gate on `NA_WERYFIKACJI`, independent
   * of the manual `OCZEKUJE_NA_AUTORYZACJE` / `authorizationRequired` flow).
   *
   * When a verifier saves a verification and the compensation STRICTLY exceeds
   * `getAuthThreshold(drivenDays)`, the accept/reject decision is HARD-BLOCKED
   * (422 `CLAIM_AUTHORIZATION_REQUIRED`) until the verifier uploads a screenshot
   * of Maksim's out-of-band confirmation (a `ClaimAttachment` with
   * `category=AUTORYZACJA_MAKSIMA`).
   *
   *  - `maksimGateRequired`   — the gate is active for this claim.
   *  - `maksimGateNotifiedAt` — when the auto-email to Maksim was sent (dedup;
   *    `null` = not sent yet). The web reads this to show "powiadomiono Maksima".
   *  - `maksimGateClearedAt`  — when the confirmation screenshot lifted the gate
   *    (`null` while the gate is still blocking). Once set (and `Required`
   *    stays `true`), the decision buttons re-enable.
   *
   * All three reset in lockstep with `verifiedAt` whenever the verification is
   * invalidated (verifier period/mileage edit, delegation auto-recalc).
   */
  maksimGateRequired: z.boolean(),
  maksimGateNotifiedAt: IsoDateTimeSchema.nullable(),
  maksimGateClearedAt: IsoDateTimeSchema.nullable(),

  attachments: z.array(ClaimAttachmentDtoSchema),

  /**
   * Phase 7 REWORK (2026-06-20 #4) — the outing this wniosek was filed against.
   * `@unique` FK → Delegation. Nullable on the wire for legacy/pre-rework rows;
   * always set for new wnioski.
   */
  delegationId: UuidSchema.nullable(),
  /**
   * The linked outing's planned / actual return, EMBEDDED on the claim so the
   * pracownik ClaimModal renders the «POWIĄZANY WYJAZD» plan/fakt without a
   * separate `GET /delegations/:id` (which pracownik may not read per
   * docs/03-roles.md). `null` when there is no linked outing (or, for
   * `actual`, the outing hasn't transitioned to `zjechal` yet). `planned` is
   * date-only (`YYYY-MM-DD`); `actual` is a full ISO datetime — mirrors the
   * Delegation DTO shapes.
   */
  delegationPlannedReturnAt: IsoDateSchema.nullable(),
  delegationActualReturnAt: IsoDateTimeSchema.nullable(),
  /**
   * The linked outing's lifecycle status, EMBEDDED on the claim so the pracownik
   * ClaimModal can render the read-only "w trasie" banner and the FE in-transit
   * gate keys off the SAME field the API gates on. `null` when there is no
   * linked outing (legacy / pre-rework rows). When `'w_trasie'` the verifier-side
   * actions (verify / request-authorization / accept / reject) are HARD-blocked
   * server-side with 422 `CLAIM_DELEGATION_IN_TRANSIT`; a `'zjechal'` outing (or
   * a null status) passes through. Reuses `DelegationStatusSchema` so the wire
   * enum stays in lockstep with the Delegation DTO.
   */
  delegationStatus: DelegationStatusSchema.nullable(),
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
