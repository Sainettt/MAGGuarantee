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

/**
 * Mirror of the Prisma `ReklamacjaResolution` enum (migration
 * `20260731120000_add_reklamacja_resolution_fields`) — the OUTCOME of a
 * reklamacja decision. Same mirroring convention as `ClaimStatusSchema`: the
 * shared package is Zod-only and cannot import `@magguarantee/database`.
 *
 * Deliberately NOT a `ClaimStatus` value: the decision rolls `status` BACK to
 * `statusBeforeReklamacja` for BOTH outcomes (an uznana reklamacja on a rejected
 * wniosek leaves the wniosek rejected — only the reklamacja is paid), so the
 * outcome needs its own column. `null` means "no reklamacja was ever filed" OR
 * "filed and still pending"; the two are told apart by
 * `status === 'REKLAMACJA'` (pending) / `reklamacjaSubmitted`.
 *
 * NEVER derive the outcome from the resulting `status`.
 */
export const ReklamacjaResolutionSchema = z.enum(['UZNANA', 'ODRZUCONA']);
export type ReklamacjaResolution = z.infer<typeof ReklamacjaResolutionSchema>;

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

// NOTE: money and `hoursAdjusted` are server/verifier-managed and are NOT part
// of the carrier submit body — the requested amount is derived from km-calc
// server-side (`paymentEur`, snapshotted once into `origPaymentEur`),
// `hoursAdjusted` lives only on the verifier `UpdateClaimCorrectionFields`
// patch below.
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
 * - The requested amount is **NOT** in the carrier submit body — the service
 *   derives it from the km-calc `paymentEur` (rounded to 2 dp) and freezes that
 *   figure into `origPaymentEur`. Legacy GAS allowed a manual override; we
 *   don't.
 * - `hoursAdjusted` is **NOT** in the carrier submit body — it is a
 *   verifier-only correction field on `UpdateClaimCorrectionFields`. Submit
 *   always persists `0` in both `origHoursAdjusted` and `hoursAdjustedValue`.
 * - A claim stores no planista/opiekun column and clients send none. The mail
 *   recipients are resolved at send time: the planista of the outing's
 *   period (the snapshot `Delegation.plannerId`, docs/29 U8 — NOT the
 *   vehicle's current planista) plus his current lider in CC, and the
 *   carrier's opiekun.
 * - `orderNumber` / `orderDate` are intentionally NOT in the submit DTO —
 *   they are MAGTRANS-internal and assigned by the verifier when transitioning
 *   to ZAAKCEPTOWANO. Carrier-side submit always persists NULL.
 *
 * ⚠️ REWORK 2026-07-30 — the carrier declares the FACTS again.
 * ---------------------------------------------------------------------------
 * Customer decision: `dateStart` / `dateEnd` / `timeFrom` / `timeTo` /
 * `mileage` are back in the carrier body. They are NO LONGER derived from the
 * outing's `actualDepartureAt` / `actualReturnAt` / the weryfikator's daily-km
 * board. Rationale: the money follows the mileage recorded in SpedTrans, while
 * the weryfikator's per-day km come from a different external system — the two
 * sets never agree, so the carrier states its own claim and `pracownik`
 * reconciles.
 *
 * What this does NOT change:
 *  - the outing link (`delegationId`) stays REQUIRED and `@unique`;
 *  - only a `zjechal` outing may back a wniosek;
 *  - the weryfikator keeps recording the actual departure/return datetimes and
 *    the daily-km board — those are now the REFERENCE `pracownik` compares
 *    against (rendered side-by-side in the ClaimModal), not the source.
 *
 * Server-side rules the schema cannot express (see `ClaimsService.submit`):
 *  - `dateStart >= day(Delegation.departureAt)` — the carrier may not claim a
 *    departure EARLIER than the one it declared when reporting the outing
 *    (422 `CLAIM_DATE_BEFORE_DEPARTURE`);
 *  - the submission deadline (`max_days_after_unload`) is measured from
 *    `Delegation.actualReturnAt` (the weryfikator's fact), NOT from the
 *    carrier-typed `dateEnd` — otherwise a late carrier would simply type a
 *    fresher date and walk past the deadline.
 *
 * Deliberately NOT constrained (customer decision): `dateEnd` may fall before
 * or after the actual return (a truck can come back a day early or four days
 * late), and `mileage` is free-form — no soft warning, no prefill. Catching a
 * bad number is exactly what the `pracownik` verification step is for.
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

    /**
     * Carrier-declared loading date (REWORK 2026-07-30). Floor-checked
     * server-side against the outing's declared `departureAt`.
     */
    dateStart: IsoDateSchema,
    /**
     * Carrier-declared unloading date. Free relative to the outing's actual
     * return — earlier and later are both legitimate.
     */
    dateEnd: IsoDateSchema,
    /** Carrier-declared departure time. REQUIRED — the column is NOT NULL. */
    timeFrom: HhMmSchema,
    /** Carrier-declared return time. REQUIRED — the column is NOT NULL. */
    timeTo: HhMmSchema,
    /** Carrier-declared mileage for the period. Free-form; verifier revises. */
    mileage: MileageSchema,

    comment: emptyStringToUndefined(z.string().max(2_000).optional()),

    /** Optional pre-uploaded attachment IDs (auth screenshot, photos, etc.). */
    attachmentIds: z.array(UuidSchema).max(20).optional(),
  })
  .strict()
  .refine(datesWellOrdered, {
    message: 'dateStart must be on or before dateEnd',
    path: ['dateEnd'],
  });
export type SubmitClaimDto = z.infer<typeof SubmitClaimSchema>;

// ─── Verify (pracownik verification checkpoint) ──────────

/**
 * PATCH /claims/:nrZgl/verification — the verifier's «Zapisz weryfikację»
 * checkpoint per docs/13-api-design.md#claims.
 *
 * Product decision (final): a `pracownik` (or `admin`) persists their
 * corrections to a claim in status `NA_WERYFIKACJI` via this checkpoint BEFORE
 * making any decision. The decision transitions (akceptacja / odmowa) FROM
 * `NA_WERYFIKACJI` are then GATED (422 `CLAIM_NOT_VERIFIED`) until the claim
 * carries a `verifiedAt` stamp. Transitions FROM `OCZEKUJE_NA_AUTORYZACJE` and
 * `REKLAMACJA` are NOT gated.
 *
 * AUTOMATIC status transition (the ONLY authorization mechanism — the manual
 * OCZEKUJE_NA_AUTORYZACJE request flow was removed): when the FINAL dopłata
 * STRICTLY exceeds `getAuthThreshold(drivenDays)` the service auto-moves a
 * `NA_WERYFIKACJI` claim into `OCZEKUJE_NA_AUTORYZACJE` (and sends the Maksim
 * confirmation email, amount-deduped); an admin re-verify in
 * `OCZEKUJE_NA_AUTORYZACJE` that drops the amount back under threshold
 * auto-rolls the status back to `NA_WERYFIKACJI`.
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
     * OPTIONAL on preview. Present on the carrier new-claim path — it identifies
     * the outing so the api can run the SAME gates submit will (ownership,
     * `zjechal`, not-already-claimed, guarantee, departure floor) and the caller
     * learns about a blocker before typing the rest of the form.
     *
     * ⚠️ REWORK 2026-07-30: the outing no longer SUPPLIES the period, times or
     * mileage — the carrier types those and sends them alongside `delegationId`
     * (they are required on submit). Absent `delegationId` = the existing-claim
     * / verifier inspection path, unchanged.
     */
    delegationId: emptyStringToUndefined(UuidSchema.optional()),
    /**
     * OPTIONAL — only meaningful on the existing-claim / verifier inspection
     * path (`POST /claims/:nrZgl/preview`). On the carrier new-claim path the
     * vehicle is derived from `delegationId`, so this is omitted there.
     */
    vehicleId: emptyStringToUndefined(UuidSchema.optional()),
    /**
     * The period to price. Carrier-typed on the new-claim path (REWORK
     * 2026-07-30), claim-persisted-or-verifier-edited on the inspection path.
     * Optional so a half-filled form can still ping the endpoint; the api
     * answers with a violation instead of a price when they are missing.
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
     * ⚠️ REWORK 2026-07-30: the CARRIER new-claim path now sends these too —
     * the time window is carrier-declared again, so the live preview must price
     * what the carrier typed. Only the `przewoznik` reklamacja-inspection path
     * (existing claim, no `delegationId`) still falls back to the persisted
     * times. Empty string → undefined.
     */
    timeFrom: emptyStringToUndefined(HhMmSchema.optional()),
    timeTo: emptyStringToUndefined(HhMmSchema.optional()),
    /**
     * The DECLARED mileage to price. On `POST /claims/:nrZgl/preview` a
     * verifier (`pracownik` / `admin`) may send it to replace the claim's
     * stored mileage, so the ClaimModal's dopłata / RecalcBadge / accept-gate /
     * auto-populated `amountApproved` track a km edit before the PATCH commits —
     * mirroring what the PATCH recalc will persist
     * (`UpdateClaimCorrectionFields.mileage`). The CARRIER new-claim path
     * (`delegationId` present) sends the carrier's own figure; the `przewoznik`
     * reklamacja-inspection path ignores it.
     *
     * For a mixed period (a month with `kmPerDay = 0`) the payout is settled on
     * the daily-km board instead, so this figure does not move the price there
     * (docs/20 §0⁵). Empty string → undefined (form-friendly) via the same
     * preprocessor the sibling fields use — a cleared numeric input never
     * reaches `.nonnegative()`.
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

// ─── Reklamacja ──────────────────────────────────────────

/**
 * POST /claims/:nrZgl/reklamacja — a carrier disputes a DECIDED wniosek.
 *
 * REWORK 2026-07-31 — the reklamacja is amount + reason ONLY: the carrier no
 * longer amends any claim data (no period / times / mileage). `kwotaReklamacji`
 * is the UNPAID REMAINDER the carrier is now asking for and must satisfy
 * `0 < kwota <= maxAmount`, where `maxAmount` comes from
 * `resolveReklamacjaCap()` in `domain/reklamacja-rules.ts` (the api enforces the
 * ceiling — a schema cannot see the claim row).
 *
 * `.positive()` (not `.nonnegative()`): a 0 € reklamacja asks for nothing, so it
 * is a malformed request (400), not a business rule violation. The upper sanity
 * bound stays to keep a typo from hitting a Postgres numeric overflow.
 */
export const SubmitReklamacjaSchema = z
  .object({
    tresc: z.string().min(1).max(4_000),
    kwotaReklamacji: z.number().positive().max(9_999_999),
  })
  .strict();
export type SubmitReklamacjaDto = z.infer<typeof SubmitReklamacjaSchema>;

// ─── Reklamacja — stable machine codes (422 / 409 `extensions.code`) ──
//
// Same convention as `VEHICLE_NOT_GUARANTEED` / `CLAIM_DATE_BEFORE_DEPARTURE` in
// `schemas/delegations.ts`: the api throws them inside the single-code
// `extensions` envelope, the web pattern-matches to pick the localized copy.

/** 409 — one reklamacja per wniosek, ever (`reklamacjaSubmitted` already set). */
export const REKLAMACJA_ALREADY_SUBMITTED =
  'REKLAMACJA_ALREADY_SUBMITTED' as const;

/** 422 — the wniosek is not decided yet (`ZAAKCEPTOWANO`/`ODRZUCONO` only). */
export const REKLAMACJA_CLAIM_NOT_DECIDED =
  'REKLAMACJA_CLAIM_NOT_DECIDED' as const;

/** 422 — more than `REKLAMACJA_WINDOW_HOURS` (48 h) since the decision. */
export const REKLAMACJA_WINDOW_EXPIRED = 'REKLAMACJA_WINDOW_EXPIRED' as const;

/** 422 — the payout already covers the amount originally requested. */
export const REKLAMACJA_NO_DELTA = 'REKLAMACJA_NO_DELTA' as const;

/** 422 — `kwotaReklamacji` exceeds `maxAmount` (strict, cent precision). */
export const REKLAMACJA_AMOUNT_EXCEEDS_CAP =
  'REKLAMACJA_AMOUNT_EXCEEDS_CAP' as const;

/**
 * 422 — a `REKLAMACJA_*` PATCH target was used on a claim that is NOT sitting in
 * `REKLAMACJA` (no pending reklamacja to decide). Without this guard the
 * synthetic accept would be indistinguishable from a fresh accept out of
 * `NA_WERYFIKACJI` (a legal edge) and would slip past the decision gates.
 */
export const REKLAMACJA_NOT_PENDING = 'REKLAMACJA_NOT_PENDING' as const;

/**
 * 422 — `POST /claims/:nrZgl/recalc-limits` was called on a wniosek whose
 * amount is frozen. The refresh re-prices a wniosek with the CURRENT
 * `monthly_limits` (the escape hatch from the limits-snapshot freeze), so it
 * is allowed ONLY in `NA_WERYFIKACJI`:
 *  - `OCZEKUJE_NA_AUTORYZACJE` — Maksim was already emailed a concrete
 *    dopłata; the number must not move underneath the authorization;
 *  - any decided status (`ZAAKCEPTOWANO` / `ODRZUCONO` / `REKLAMACJA`) — the
 *    money is settled; re-pricing it silently would rewrite history.
 * Same single-code `extensions` envelope as `CLAIM_AUTHORIZATION_REQUIRED`.
 */
export const CLAIM_LIMITS_REFRESH_BLOCKED =
  'CLAIM_LIMITS_REFRESH_BLOCKED' as const;

/**
 * 422 — `ZAAKCEPTOWANO` on a MIXED period (a month with `kmPerDay = 0`, so the
 * payout is settled on the weryfikator's daily-km board, docs/20 §0⁵) while a
 * counted day of a guaranteed month has no board row. `extensions.missingDates`
 * lists those days (ISO `YYYY-MM-DD`, ascending). The weryfikator fills them
 * in; nothing is guessed. Never raised for `ODRZUCONO` or a reklamacja.
 */
export const CLAIM_BOARD_INCOMPLETE = 'CLAIM_BOARD_INCOMPLETE' as const;

/**
 * 422 — `ZAAKCEPTOWANO` on a mixed period whose LIVE board-based dopłata
 * differs from the one saved at verification, or is over the Maksim threshold
 * without the gate armed and cleared at exactly that amount. Two causes: the
 * board is live data and can move after «Zapisz weryfikację», OR the decision
 * carries unsaved corrections (the web sends every correction field with it).
 * Re-saving the verification re-prices the claim and re-arms the gate. Never
 * raised for `ODRZUCONO` or a reklamacja.
 */
export const CLAIM_BOARD_CHANGED = 'CLAIM_BOARD_CHANGED' as const;

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
 * Source of the kilometres a claim's payout was settled on
 * (`ClaimSettlement.mileageSource` in `domain/claim-settlement.ts`):
 *  - `declared` — every month of the period has its weekday guarantee on, the
 *    carrier's declared mileage is charged against the guarantee;
 *  - `board`    — some month has `kmPerDay = 0`; the weryfikator's daily-km
 *    board over the counted days of the guaranteed months is charged instead.
 */
export const MileageSourceSchema = z.enum(['declared', 'board']);
export type MileageSource = z.infer<typeof MileageSourceSchema>;

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
 * `daysActive` / `daysTotal` / `mileageEffective` / `mileageSource` come from
 * the settlement pass (`domain/claim-settlement.ts`). When every month of the
 * period has its weekday guarantee on, the declared mileage is charged against
 * the guarantee (`mileageSource: 'declared'`, `mileageEffective ===
 * claim.mileage`). When some month has `kmPerDay = 0`, the kilometres charged
 * are the weryfikator's daily-km board summed over the counted days of the
 * guaranteed months (`mileageSource: 'board'`, docs/20 §0⁵). The per-month
 * board detail is NOT persisted here — the board is live data and is served
 * separately as `boardSettlement` (see `ClaimBoardSettlementSchema`).
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
    /**
     * Counted days that fall on months whose guarantee is switched ON
     * (`kmPerDay > 0 || kmPerSaturday > 0`). `.optional()` + backfilled to
     * `totalDays`: every wniosek written before the «wyłączane limity»
     * feature had all of its months active by construction.
     */
    daysActive: z.number().nonnegative().optional(),
    /**
     * Counted days over the whole period (weekday days + qualifying
     * Saturdays) — equal to `totalDays` up to 2-dp rounding. Backfilled to
     * `totalDays` on legacy rows for the same reason as `daysActive`.
     */
    daysTotal: z.number().nonnegative().optional(),
    /**
     * The kilometres charged against the guarantee when the claim was last
     * priced: the declared mileage (`mileageSource: 'declared'`) or the board
     * sum over the counted days (`mileageSource: 'board'`). Deliberately NOT
     * backfilled — absent on legacy rows, where the UI renders
     * `claim.mileage`. See `packages/shared/src/domain/claim-settlement.ts`.
     */
    mileageEffective: z.number().nonnegative().optional(),
    /**
     * Where `mileageEffective` came from. Persisted, NOT backfilled: absent ⇒
     * `'declared'` (every row written before the board settlement had its
     * mixed periods priced on the declared mileage).
     */
    mileageSource: MileageSourceSchema.optional(),
  })
  .transform((v) => ({
    ...v,
    rawTotalDays: v.rawTotalDays ?? v.totalDays,
    daysActive: v.daysActive ?? v.totalDays,
    daysTotal: v.daysTotal ?? v.totalDays,
  }));
export type KmCalcBreakdown = z.infer<typeof KmCalcBreakdownSchema>;

// ─── Board settlement (mixed periods, docs/20 §0⁵) ───────

/** Mirror of `SettlementMonthMode` in `domain/claim-settlement.ts`. */
export const SettlementMonthModeSchema = z.enum([
  'active',
  'saturdaysOnly',
  'off',
]);

/**
 * One calendar month of a mixed period on the board — wire mirror of
 * `SettlementBoardMonth` in `domain/claim-settlement.ts`:
 *  - `km`           — Σ `drove` km on the counted days (0 for `off`);
 *  - `daysRequired` — `active`: every calendar day of month ∩ period;
 *                     `saturdaysOnly`: the credited Saturdays; `off`: 0;
 *  - `daysFilled`   — required days with a row (`drove` or `idle`);
 *  - `missingDates` — required days without a row, ascending.
 */
export const SettlementBoardMonthSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  mode: SettlementMonthModeSchema,
  km: z.number().nonnegative(),
  daysFilled: z.number().int().nonnegative(),
  daysRequired: z.number().int().nonnegative(),
  missingDates: z.array(IsoDateSchema),
});
export type SettlementBoardMonthDto = z.infer<typeof SettlementBoardMonthSchema>;

/**
 * The LIVE board settlement of a mixed-period claim, computed on read (never
 * persisted — the board is filled in after submit, so a frozen copy would go
 * stale). Staff-only:
 *  - `POST /claims/:nrZgl/preview` — for `pracownik` / `admin`, from the
 *    previewed inputs;
 *  - `GET /claims/:nrZgl` — for `admin` / `pracownik` / `opiekun`, from the
 *    claim's stored period, times, `hoursAdjustedValue` and limits snapshot.
 * `null` (or absent) for a carrier, for list items and whenever the period is
 * all-active (`mileageSource: 'declared'`).
 *
 * `mileageEffective` / `kmDifference` / `paymentEur` are what the claim would
 * be paid on right now; `complete === false` means acceptance is blocked
 * (422 `CLAIM_BOARD_INCOMPLETE`) until the weryfikator fills `missingDates`.
 */
export const ClaimBoardSettlementSchema = z.object({
  mileageEffective: z.number().nonnegative(),
  kmDifference: z.number(),
  paymentEur: z.number().nonnegative(),
  months: z.array(SettlementBoardMonthSchema),
  missingDates: z.array(IsoDateSchema),
  complete: z.boolean(),
});
export type ClaimBoardSettlement = z.infer<typeof ClaimBoardSettlementSchema>;

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
   * The DECLARED mileage the preview was priced with: the carrier's typed value
   * on the new-claim path, the verifier's unsaved edit or the claim's stored
   * mileage on the existing-claim path (the bare-vehicle legacy path falls back
   * to the board sum). For a mixed period the payout is settled on the board
   * instead — see `breakdown.mileageSource` / `breakdown.mileageEffective`.
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
  /**
   * Live per-month board settlement — ONLY on `POST /claims/:nrZgl/preview`
   * for `pracownik` / `admin`, and non-null only when the previewed period is
   * mixed (`breakdown.mileageSource === 'board'`). Absent for carrier callers
   * (new-claim and reklamacja inspection alike). See
   * `ClaimBoardSettlementSchema`.
   */
  boardSettlement: ClaimBoardSettlementSchema.nullable().optional(),
  /**
   * Staff-only board TOTAL: Σ `VehicleDailyKm.km` (state `drove`) of the
   * claim's vehicle over the preview's working period — the body's (possibly
   * edited) inclusive `dateStart`/`dateEnd`, not the persisted ones. Backs the
   * pracownik hint «Wg tablicy przebiegów: N km» + «Zastosuj» in the ClaimModal
   * (distinct from `mileage`, which stays the DECLARED figure the preview was
   * priced with).
   *
   * ONLY on `POST /claims/:nrZgl/preview` for `pracownik` / `admin` (same gate
   * as `boardSettlement`); absent for carrier callers. `null` when the claim
   * has no vehicle, a period date is missing / invalid, or the board is not
   * available. A real board sum of 0 is `0`, not `null`.
   */
  boardSumKm: z.number().nonnegative().nullable().optional(),
});
export type PreviewClaimResponse = z.infer<typeof PreviewClaimResponseSchema>;

// ─── Limits-refresh dry run ──────────────────────────────

/**
 * The five money/day figures a limits refresh can move. Deliberately a small,
 * flat block — the dialog compares two of these side by side and nothing else
 * on the wniosek changes (period, mileage, status and the `orig*` snapshots
 * are untouched by `POST /claims/:nrZgl/recalc-limits`).
 */
export const RecalcLimitsFiguresSchema = z.object({
  kmGuaranteed: z.number(),
  /** May be negative — the carrier out-drove the (new) guarantee. */
  kmDifference: z.number(),
  paymentEur: z.number().nonnegative(),
  ratePerKmEffective: z.number().nonnegative(),
  drivenDays: z.number().nonnegative(),
});
export type RecalcLimitsFigures = z.infer<typeof RecalcLimitsFiguresSchema>;

/**
 * Response of `GET /claims/:nrZgl/recalc-limits/preview` — the DRY RUN behind
 * the «Przelicz wg aktualnych limitów» confirmation dialog
 * (docs/14-design-system.md §16.6).
 *
 * Why it exists: applying a refresh overwrites the wniosek's limits snapshot
 * with a fresh `breakdown`, i.e. it is not reversible by re-running anything.
 * Confirming that AFTER the write would be confirmation after the fact, and
 * the frontend has no other way to obtain the numbers: `POST /claims/:nrZgl/
 * preview` is deliberately pinned to the wniosek's frozen snapshot, and
 * `GET /limits` is admin-only (a `pracownik` cannot read the live limits at
 * all). So the api computes the "next" figures with the SAME code path as the
 * write and returns them without persisting anything.
 *
 * Deliberately NOT a `ClaimDto`: nothing has been written, and handing back a
 * claim-shaped object that does not exist in the database invites the client
 * to cache it as state. The status gate (422 `CLAIM_LIMITS_REFRESH_BLOCKED`)
 * is identical to the write endpoint's, so the refusal arrives BEFORE the
 * dialog opens.
 */
export const RecalcLimitsPreviewSchema = z.object({
  /** `true` when at least one of the five figures differs. */
  changed: z.boolean(),
  /** What the wniosek carries right now (its frozen limits snapshot). */
  current: RecalcLimitsFiguresSchema,
  /** What it would carry after a refresh against today's `monthly_limits`. */
  next: RecalcLimitsFiguresSchema,
});
export type RecalcLimitsPreviewDto = z.infer<typeof RecalcLimitsPreviewSchema>;

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

  /**
   * The three money fields form one chain and must always be read together:
   *   `origPaymentEur` — what the carrier originally asked for (frozen at
   *                      submit, see below);
   *   `paymentEur`     — the km-calc AFTER the verifier's corrections;
   *   `amountApproved` — what MAGTRANS actually pays (only once ZAAKCEPTOWANO).
   * The old `amountRequested` field was removed with the 2026-07-26 column drop
   * — it was a byte-for-byte mirror of `paymentEur`, and surfacing it as
   * «Wnioskowana» misrepresented the post-verification figure as the request.
   */
  amountApproved: z.number().nullable(),

  /**
   * Reklamacja block (REWORK 2026-07-31). One reklamacja per wniosek, ever:
   *
   *  - `reklamacjaSubmitted`   — one-shot flag, never reset.
   *  - `reklamacjaText`        — the carrier's justification (`tresc`).
   *  - `reklamacjaAmount`      — the kwota the carrier asked for; on an UZNANA
   *    outcome this EXACT figure is what gets paid (staff no longer set one).
   *  - `reklamacjaResponse`    — MAGTRANS' answer; REQUIRED on `ODRZUCONA`.
   *  - `reklamacjaResolution`  — the OUTCOME. `null` = never filed OR still
   *    pending; pending ⇔ `status === 'REKLAMACJA'`. **Never** derive the outcome
   *    from `status`: the decision rolls `status` back to
   *    `statusBeforeReklamacja` for BOTH outcomes.
   *  - `reklamacjaOrderNumber` — «Nr zlecenia» the uznana reklamacja is paid
   *    under. Independent of the wniosek's own `orderNumber` (which the
   *    reklamacja never touches); non-empty whenever resolution is `UZNANA`
   *    (DB CHECK `claim_reklamacja_resolution_complete`).
   *  - `reklamacjaSubmittedAt` — when the carrier filed. Cannot be derived from
   *    `statusChangedAt`: the decision re-stamps that on the status rollback.
   *  - `reklamacjaDecidedAt`   — when pracownik/admin decided. `null` on a
   *    pending reklamacja AND on backfilled pre-rework rows ("unknown").
   */
  reklamacjaSubmitted: z.boolean(),
  reklamacjaText: z.string().nullable(),
  reklamacjaResponse: z.string().nullable(),
  reklamacjaAmount: z.number().nullable(),
  reklamacjaResolution: ReklamacjaResolutionSchema.nullable(),
  reklamacjaOrderNumber: z.string().nullable(),
  reklamacjaSubmittedAt: IsoDateTimeSchema.nullable(),
  reklamacjaDecidedAt: IsoDateTimeSchema.nullable(),
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

  /**
   * Maksim authorization gate. When a verifier saves a verification and the
   * compensation STRICTLY exceeds `getAuthThreshold(drivenDays)`, the service
   * auto-moves the claim into `OCZEKUJE_NA_AUTORYZACJE` and the accept/reject
   * decision is HARD-BLOCKED (422 `CLAIM_AUTHORIZATION_REQUIRED`) until the
   * verifier uploads a screenshot of Maksim's out-of-band confirmation (a
   * `ClaimAttachment` with `category=AUTORYZACJA_MAKSIMA`).
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
   * The outing's DECLARED departure (what the carrier reported when it
   * registered the outing) and the weryfikator's RECORDED actual departure.
   *
   * Added by the REWORK 2026-07-30: now that the carrier declares the claim's
   * period/times itself, `pracownik` needs the weryfikator's figures next to
   * the carrier's to see where the two disagree — that comparison IS the
   * verification job. `delegationDepartureAt` doubles as the floor the api
   * enforces on `dateStart` (422 `CLAIM_DATE_BEFORE_DEPARTURE`).
   */
  delegationDepartureAt: IsoDateTimeSchema.nullable(),
  delegationActualDepartureAt: IsoDateTimeSchema.nullable(),
  /**
   * Σ `VehicleDailyKm.km (state=drove)` over the weryfikator's actual window
   * for this claim's vehicle — the km-board figure to compare the carrier's
   * declared `mileage` against.
   *
   * VERIFIER-ONLY and DETAIL-ONLY: populated by `GET /claims/:nrZgl` for
   * `pracownik` / `admin`, `null` for a carrier (the two systems disagree by
   * design — showing the carrier a second number would only invite argument)
   * and `null` in list responses (it costs a query per row).
   */
  verifierMileage: z.number().nullable(),
  /**
   * LIVE board settlement for a mixed period (docs/20 §0⁵) — per-month board
   * km, filled/required days and the missing dates, plus the amount the claim
   * would be paid on right now. Computed on read by `GET /claims/:nrZgl` for
   * `admin` / `pracownik` / `opiekun` from the claim's stored period, times,
   * `hoursAdjustedValue` and limits snapshot (opiekun cannot call the preview
   * endpoint, hence it lives here too).
   *
   * `null` for a carrier, in every other response that returns a `ClaimDto`
   * (submit / PATCH / verification / recalc-limits), and whenever the period
   * is all-active. See `ClaimBoardSettlementSchema`.
   */
  boardSettlement: ClaimBoardSettlementSchema.nullable(),
  /**
   * The linked outing's lifecycle status, EMBEDDED on the claim so the pracownik
   * ClaimModal can render the read-only "w trasie" banner and the FE in-transit
   * gate keys off the SAME field the API gates on. `null` when there is no
   * linked outing (legacy / pre-rework rows). When `'w_trasie'` the verifier-side
   * actions (verify / accept / reject) are HARD-blocked server-side with 422
   * `CLAIM_DELEGATION_IN_TRANSIT`; a `'zjechal'` outing (or
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
  /**
   * Immutable submit-time payment snapshot — the ONLY field that answers "how
   * much did the carrier actually ask for", since `paymentEur` is rewritten by
   * every verifier correction / delegation recalc. Carried on the list item so
   * the pracownik table's «Wnioskowana» column tells the truth without a
   * per-row detail fetch. `null` for rows created before the column existed
   * (`20260706120000_claim_verification_checkpoint` did not backfill) — render
   * an em-dash there, never a silent fallback to the current figure.
   */
  origPaymentEur: z.number().nullable(),
  amountApproved: z.number().nullable(),
  reklamacjaSubmitted: z.boolean(),
  /**
   * Reklamacja OUTCOME, carried on the list item so the employee `<ClaimsTable>`
   * can render the secondary `<ReklamacjaResolutionChip>` under the status cell
   * (docs/14 §6.5.15) without a per-row detail fetch. `null` = never filed OR
   * still pending — the chip reads it together with `reklamacjaSubmitted`
   * (`submitted && resolution === null` ⇒ «Reklamacja w toku»).
   */
  reklamacjaResolution: ReklamacjaResolutionSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type ClaimListItem = z.infer<typeof ClaimListItemSchema>;

// ─── Update claim — discriminated union by `targetStatus` ──
//
// `PATCH /claims/:nrZgl` — the verifier's DECISION endpoint. Each variant
// carries the fields required for that single transition. Legal transitions
// follow docs/04-data-model.md. Notice that `REKLAMACJA → *` is reachable only
// by the verifier — the carrier files a reklamacja via the dedicated
// POST /claims/:nrZgl/reklamacja.
//
// NOTE: `OCZEKUJE_NA_AUTORYZACJE` is NOT a PATCH target. The claim enters (and
// leaves) `OCZEKUJE_NA_AUTORYZACJE` AUTOMATICALLY at verification time when the
// dopłata crosses `getAuthThreshold(...)` (see `VerifyClaimSchema`) — there is
// no manual authorization request. PATCH only accepts
// the decision targets below (both `NA_WERYFIKACJI` and `OCZEKUJE_NA_AUTORYZACJE`
// are legal predecessors of `ZAAKCEPTOWANO` / `ODRZUCONO`).

const UpdateClaimAmountSchema = z.number().nonnegative().max(9_999_999);
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

/**
 * REKLAMACJA → UZNANA — pracownik/admin accepts the dispute.
 *
 * REWORK 2026-07-31:
 *  - the paid amount is EXACTLY the carrier's `reklamacjaAmount` (frozen at
 *    submit, already capped by `origPaymentEur − alreadyPaid`), so the staff no
 *    longer sends an amount — `reklamacjaAmount` was REMOVED from this branch;
 *  - `reklamacjaOrderNumber` («Nr zlecenia» the dopłata is paid under) is
 *    REQUIRED — the UI prefills it from `claim.orderNumber` but it is an
 *    INDEPENDENT field and the wniosek's own `orderNumber` is never touched
 *    (DB CHECK `claim_reklamacja_resolution_complete` mirrors this);
 *  - the correction fields were REMOVED — a reklamacja no longer amends carrier
 *    data (no period / times / mileage / hoursAdjusted), so km-calc never re-runs
 *    on this branch and the amounts stay frozen;
 *  - `comment` is now OPTIONAL (it lands in `reklamacjaResponse`): an acceptance
 *    speaks for itself, a rejection must justify itself.
 *
 * The resulting `status` is NOT `ZAAKCEPTOWANO`: the service rolls it back to
 * `statusBeforeReklamacja` and records the outcome in `reklamacjaResolution`.
 */
const UpdateClaimReklamacjaAccepted = z
  .object({
    targetStatus: z.literal('REKLAMACJA_ZAAKCEPTOWANO'),
    /** REQUIRED — «Nr zlecenia» under which the dopłata is paid. */
    reklamacjaOrderNumber: z.string().min(1).max(64),
    /** OPTIONAL — staff note, stored in `reklamacjaResponse`. */
    comment: emptyStringToUndefined(z.string().max(4_000).optional()),
  })
  .strict();

/**
 * REKLAMACJA → ODRZUCONA — pracownik/admin rejects the dispute.
 *
 * `comment` stays REQUIRED: it is the rejection JUSTIFICATION and is persisted
 * to `reklamacjaResponse` (docs/04-data-model.md — the api-layer mirror of the
 * `UZNANA ⇒ reklamacjaOrderNumber` DB CHECK). No corrections, no amount.
 */
const UpdateClaimReklamacjaRejected = z
  .object({
    targetStatus: z.literal('REKLAMACJA_ODRZUCONO'),
    /** REQUIRED — rejection reason → `reklamacjaResponse`. */
    comment: UpdateClaimCommentSchema,
  })
  .strict();

/**
 * PATCH /claims/:nrZgl — discriminated by `targetStatus`. The synthetic
 * `REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO` literals are wire-only.
 *
 * REWORK 2026-07-31 — they no longer translate to a FIXED `ZAAKCEPTOWANO` /
 * `ODRZUCONO`. Both outcomes roll `status` back to `statusBeforeReklamacja`
 * (defensive fallback when that column is somehow NULL:
 * `amountApproved != null ? 'ZAAKCEPTOWANO' : 'ODRZUCONO'`); the outcome itself
 * lives in `reklamacjaResolution` (`UZNANA` / `ODRZUCONA`). A `REKLAMACJA_*`
 * target on a claim not sitting in `REKLAMACJA` is refused with 422
 * `REKLAMACJA_NOT_PENDING`.
 */
export const UpdateClaimSchema = z.discriminatedUnion('targetStatus', [
  UpdateClaimToAccepted,
  UpdateClaimToRejected,
  UpdateClaimReklamacjaAccepted,
  UpdateClaimReklamacjaRejected,
]);
export type UpdateClaimDto = z.infer<typeof UpdateClaimSchema>;
