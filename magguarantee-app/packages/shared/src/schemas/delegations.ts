// Phase 3 — Delegations DTO contracts.
//
// Source of truth for `/api/v1/delegations/*` per docs/13-api-design.md
// and the `Delegation` model in packages/database/prisma/schema.prisma:433+.
//
// Delegations are vehicle outings: carrier registers (zgloszony), weryfikator
// flips to `w_trasie` and finally `zjechal`. Either party can move it to
// `anulowany` per the documented role rules — carrier may cancel only
// their own `zgloszony` rows, weryfikator may cancel anything.
//
// Required-fields contract (db migration
// `20260518113943_delegation_required_fields_and_date_only`):
//   - `driverId`, `trailerId`, `plannedReturnAt`, `returnCountry`,
//     `returnPostalCode` are NOT NULL in the DB. The legacy
//     `delegation_returned_complete` CHECK has been dropped — completeness at
//     `zjechal` is now enforced by the api layer (status guard on
//     `actualReturnAt`), and all return-planning fields are required at
//     submit time per the 2026-05 product decision.
//   - `plannedReturnAt` is `@db.Date` (date-only) — driver commits to a day,
//     not a timestamp.

import { z } from 'zod';

import {
  EU_VAT_COUNTRY_CODES,
  isValidPostalCode,
} from '../constants';
import {
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';
import { VehicleDispatchTeamSchema } from './teams';

// ─── Enum mirror (Prisma DelegationStatus) ───────────────

// Phase 7 REWORK (2026-06-20 #4, docs/20 §0″) — `gotowy` re-introduced as the
// eksport-owned step between carrier-`zgloszony` and weryfikator-`w_trasie`.
export const DelegationStatusSchema = z.enum([
  'zgloszony',
  'gotowy',
  'w_trasie',
  'zjechal',
  'anulowany',
]);
export type DelegationStatus = z.infer<typeof DelegationStatusSchema>;

// ─── Field primitives ────────────────────────────────────

/**
 * EU country code — VIES dialect (Greece = `EL`, not `GR`). Sourced from
 * `EU_VAT_COUNTRY_CODES` so the enum stays in lockstep with the carrier VAT
 * country list and the per-country postal rules.
 */
const CountrySchema = z.enum(EU_VAT_COUNTRY_CODES);

// Postal length is bounded by the DB CHECK (`<= 16`); per-country format
// validation happens cross-field via `.superRefine` on the object so we can
// look up the matching rule in `EU_POSTAL_CODES`.
const PostalLengthSchema = z.string().min(1).max(16);

// ─── Submit (carrier) ────────────────────────────────────

/**
 * POST /delegations — body shape per docs/13-api-design.md§Delegations.
 *
 * Notes:
 * - `carrierId` is **derived from the JWT** — never accepted in the body.
 * - `vehicleId` / `trailerId` / `driverId` ownership is enforced by
 *   `CarrierOwnershipGuard` + service-level checks.
 * - All return-planning fields are required (driver/trailer/return triple).
 * - `plannedReturnAt` is date-only (`YYYY-MM-DD`) per the `@db.Date` column.
 */
export const SubmitDelegationSchema = z
  .object({
    vehicleId: UuidSchema,
    trailerId: UuidSchema,
    driverId: UuidSchema,

    departureAt: IsoDateTimeSchema,
    /** REQUIRED — Delegation.departureCountry is NOT NULL. */
    departureCountry: CountrySchema,
    /** REQUIRED — Delegation.departurePostalCode is NOT NULL. */
    departurePostalCode: PostalLengthSchema,

    /**
     * Date-only (`YYYY-MM-DD`) — matches the `@db.Date` column. Driver
     * commits to a day, not a timestamp.
     */
    plannedReturnAt: IsoDateSchema,
    returnCountry: CountrySchema,
    returnPostalCode: PostalLengthSchema,

    /** Free-form note (e.g. cargo type, route hints). */
    comment: emptyStringToUndefined(z.string().max(2_000).optional()),
  })
  .strict()
  .superRefine((obj, ctx) => {
    if (!isValidPostalCode(obj.departureCountry, obj.departurePostalCode)) {
      ctx.addIssue({
        path: ['departurePostalCode'],
        code: z.ZodIssueCode.custom,
        message: `Nieprawidłowy format kodu pocztowego dla ${obj.departureCountry}`,
      });
    }
    if (!isValidPostalCode(obj.returnCountry, obj.returnPostalCode)) {
      ctx.addIssue({
        path: ['returnPostalCode'],
        code: z.ZodIssueCode.custom,
        message: `Nieprawidłowy format kodu pocztowego dla ${obj.returnCountry}`,
      });
    }
    // Date-level comparison (drop the time portion of `departureAt`) — the
    // planned-return is date-only, so "same day" is allowed even if the
    // departure timestamp is 23:50.
    const departureDay = obj.departureAt.slice(0, 10);
    if (obj.plannedReturnAt < departureDay) {
      ctx.addIssue({
        path: ['plannedReturnAt'],
        code: z.ZodIssueCode.custom,
        message: 'plannedReturnAt must be on or after departureAt',
      });
    }
  });
export type SubmitDelegationDto = z.infer<typeof SubmitDelegationSchema>;

// ─── Cancel ──────────────────────────────────────────────

/**
 * POST /delegations/:id/cancel — `reason` is optional but encouraged so
 * the audit log captures *why* the delegation was killed.
 */
export const CancelDelegationSchema = z
  .object({
    reason: emptyStringToUndefined(z.string().max(2_000).optional()),
  })
  .strict();
export type CancelDelegationDto = z.infer<typeof CancelDelegationSchema>;

// ─── Status transitions (Phase 7 REWORK 2026-06-20 #4) ───
//
// The delegation lifecycle is operational again (docs/20 §0″). Three POST
// transition endpoints carry these bodies:
//   - `POST /delegations/:id/ready`      — eksport|admin (`zgloszony↔gotowy`)
//   - `POST /delegations/:id/in-transit` — weryfikator|admin (`gotowy→w_trasie`)
//   - `POST /delegations/:id/returned`   — weryfikator|admin (`w_trasie→zjechal`)
// The state-machine (`delegation-state-machine.ts`) is the authority on edge
// legality; these schemas only validate the request payloads.

/**
 * POST /delegations/:id/ready — eksport (or admin) flips an outing
 * `zgloszony → gotowy` after a SpedTrans zlecenie is in place. The same
 * endpoint supports the rollback `gotowy → zgloszony` (allowed only while the
 * outing has not yet left, i.e. not `w_trasie`) via `rollback: true`.
 *
 * `note` is an optional free-form annotation appended to the outing notes for
 * the audit trail.
 *
 * `spedOrderNumber` ("Nr zlecenia ze spedu") is MANDATORY on the FORWARD flip
 * (`zgloszony → gotowy`): the eksport may only mark an outing `gotowy` once the
 * SpedTrans zlecenie exists, so the number is required and stored on the
 * delegation (`Delegation.spedOrderNumber`). On rollback (`rollback: true`) it
 * is NOT required — the field is ignored and the stored value is cleared
 * server-side, so re-advancing forces a fresh number. The cross-field rule is
 * enforced by the `.superRefine` below (a bare `.optional()` on the shape can't
 * express "required only when `!rollback`").
 */
export const MarkReadySchema = z
  .object({
    /**
     * `false` (default) → `zgloszony → gotowy`.
     * `true`            → rollback `gotowy → zgloszony` (pre-`w_trasie` only).
     */
    rollback: z.boolean().optional().default(false),
    note: emptyStringToUndefined(z.string().max(2_000).optional()),
    /**
     * "Nr zlecenia ze spedu" — the SpedTrans order number. REQUIRED on the
     * forward flip (see `.superRefine`), IGNORED on rollback. Trimmed; 1–64
     * chars. Optional at the shape level so the rollback path (which omits it)
     * still validates; the conditional requirement lives in `.superRefine`.
     */
    spedOrderNumber: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Forward flip (`zgloszony → gotowy`) requires the sped order number. On
    // rollback (`gotowy → zgloszony`) it is not required — the value is cleared
    // server-side so re-advancing must supply a fresh number.
    if (!val.rollback && !val.spedOrderNumber) {
      ctx.addIssue({
        path: ['spedOrderNumber'],
        code: z.ZodIssueCode.custom,
        message: 'Nr zlecenia ze spedu jest wymagany przy oznaczaniu jako gotowy.',
      });
    }
  });
export type MarkReadyDto = z.infer<typeof MarkReadySchema>;

/**
 * POST /delegations/:id/in-transit — weryfikator (or admin) marks an outing
 * `gotowy → w_trasie`.
 *
 * `actualDepartureAt` is a **full ISO datetime** (`YYYY-MM-DDTHH:mm:ssZ`) — the
 * exact MOMENT the vehicle actually started driving. The weryfikator captures
 * both the day AND the time on this transition: the linked wniosek's `dateStart`
 * derives from the DAY, and its `timeFrom` from the wall-clock `HH:mm` (the
 * carrier no longer types a time window). The service validates it — not in the
 * future (`<= now`, datetime granularity), not before the reported `departureAt`
 * DAY (`>= startOfUtcDay(departureAt)`, so an earlier same-day start is allowed).
 * `note` is an optional free-form annotation; the service stamps `verifiedBy/At`.
 */
export const MarkInTransitSchema = z
  .object({
    actualDepartureAt: IsoDateTimeSchema,
    note: emptyStringToUndefined(z.string().max(2_000).optional()),
  })
  .strict();
export type MarkInTransitDto = z.infer<typeof MarkInTransitSchema>;

/**
 * POST /delegations/:id/returned — weryfikator (or admin) marks an outing
 * `w_trasie → zjechal`. `actualReturnAt` is a **full ISO datetime**
 * (`YYYY-MM-DDTHH:mm:ssZ`) — the exact MOMENT the vehicle returned. The
 * weryfikator captures both the day AND the time: the linked wniosek's `dateEnd`
 * derives from the DAY and its `timeTo` from the wall-clock `HH:mm`. The service
 * validates it — not in the future (`<= now`) and not before the actual
 * departure (`>= actualDepartureAt`; you cannot return before you left) — then
 * writes it into `Delegation.actualReturnAt`, advances `Vehicle.lastDroveAt`,
 * and auto-recalculates any linked wniosek — all in one transaction.
 */
export const MarkReturnedSchema = z
  .object({
    actualReturnAt: IsoDateTimeSchema,
    note: emptyStringToUndefined(z.string().max(2_000).optional()),
  })
  .strict();
export type MarkReturnedDto = z.infer<typeof MarkReturnedSchema>;

// ─── Eligibility (carrier readiness) ─────────────────────

/**
 * Stable, machine-readable code surfaced in the `extensions.code` field of the
 * 422 problem-details envelope when a carrier fails the readiness check on
 * `POST /delegations`. The frontend pattern-matches on this code to render a
 * generic "skontaktuj się ze swoim opiekunem" banner — the carrier gets NO
 * breakdown of which item is missing (product decision: the detail lives only
 * on the opiekun side, see `OpiekunCarrierStats.attentionReasons`).
 */
export const CARRIER_NOT_READY_CODE = 'CARRIER_NOT_READY' as const;

/**
 * Stable, machine-readable code surfaced in the `extensions.code` field of the
 * 422 problem-details envelope when a carrier attempts to register a delegation
 * on `POST /delegations` whose `departureAt` is in the past (full-timestamp
 * granularity, with a small grace window — see `DEPARTURE_PAST_GRACE_MS`). The
 * frontend pattern-matches on this code to surface an inline field error on the
 * `departureAt` control. The rule is environment-dependent (bypassable via the
 * `ALLOW_PAST_DEPARTURE` env flag for tests / e2e) and lives in the service
 * only — NOT in the time-independent `SubmitDelegationSchema`.
 */
export const DEPARTURE_IN_PAST_CODE = 'DEPARTURE_IN_PAST' as const;

/**
 * Stable, machine-readable code surfaced in the `extensions.code` field of the
 * 422 problem-details envelope when the weryfikator marks an outing `w_trasie`
 * (`POST /delegations/:id/in-transit`) with an `actualDepartureAt` that is in
 * the FUTURE (`> now`, full DATETIME granularity now that the field carries a
 * time). `actualDepartureAt` is the actual start of the guarantee period, so a
 * future start is nonsensical. Distinct from `DEPARTURE_BEFORE_REPORTED_CODE`
 * (the not-before-`departureAt` check).
 */
export const DEPARTURE_DATE_FUTURE_CODE = 'DEPARTURE_DATE_FUTURE' as const;

/**
 * Stable, machine-readable code surfaced in the `extensions.code` field of the
 * 422 problem-details envelope when the weryfikator marks an outing `w_trasie`
 * (`POST /delegations/:id/in-transit`) with an `actualDepartureAt` EARLIER than
 * the carrier-reported `departureAt` DAY (compared at UTC-day granularity —
 * `actualDepartureAt >= startOfUtcDay(departureAt)`, so an earlier same-day
 * start IS allowed). A hard constraint: the actual start of driving cannot
 * predate the reported departure day. Distinct from `DEPARTURE_DATE_FUTURE_CODE`
 * (the not-in-the-future check).
 */
export const DEPARTURE_BEFORE_REPORTED_CODE =
  'DEPARTURE_BEFORE_REPORTED' as const;

/**
 * Stable, machine-readable code surfaced in the `extensions.code` field of the
 * 422 problem-details envelope when the weryfikator marks an outing `zjechal`
 * (`POST /delegations/:id/returned`) with an `actualReturnAt` that is in the
 * FUTURE (`> now`, full DATETIME granularity). A vehicle cannot have returned at
 * a moment that has not happened yet. Sibling of `DEPARTURE_DATE_FUTURE_CODE` on
 * the return side.
 */
export const RETURN_DATE_FUTURE_CODE = 'RETURN_DATE_FUTURE' as const;

/**
 * Stable, machine-readable code surfaced in the `extensions.code` field of the
 * 422 problem-details envelope when the weryfikator marks an outing `zjechal`
 * (`POST /delegations/:id/returned`) with an `actualReturnAt` EARLIER than the
 * outing's `actualDepartureAt` (full DATETIME granularity — you cannot return
 * before you left). Falls back to the reported `departureAt` when no actual
 * departure was captured (legacy). Sibling of `DEPARTURE_BEFORE_REPORTED_CODE`
 * on the return side.
 */
export const RETURN_BEFORE_DEPARTURE_CODE =
  'RETURN_BEFORE_DEPARTURE' as const;

/**
 * Stable, machine-readable code surfaced in the `extensions.code` field of the
 * 422 problem-details envelope when a carrier attempts to preview/submit a
 * wniosek against a delegation whose vehicle is NOT under guarantee
 * (`Vehicle.agreement !== true` — `false` AND `null` both count as not
 * guaranteed). The gate lives in the shared claims delegation-resolution seam
 * (`ClaimsService._resolveDelegationContext`), so it covers BOTH the preview
 * and the submit paths with a single check. The frontend pattern-matches on
 * this code to render a "skontaktuj się z opiekunem" banner — same single-code
 * envelope shape as `CARRIER_NOT_READY_CODE` / `DEPARTURE_IN_PAST_CODE` (NOT
 * the multi-rule `violations[]` array).
 */
export const VEHICLE_NOT_GUARANTEED = 'VEHICLE_NOT_GUARANTEED' as const;

/**
 * 422 code — the carrier declared a loading date EARLIER than the departure it
 * reported when it registered the outing (REWORK 2026-07-30, when the carrier
 * took the period/times/mileage back into its own hands).
 *
 * The floor is the DECLARED `Delegation.departureAt`, not the weryfikator's
 * `actualDepartureAt`: the carrier may legitimately have left later than
 * planned, and the weryfikator's figure comes from a different external system
 * — but nobody can have left before they said they would. Same single-code
 * envelope shape as `VEHICLE_NOT_GUARANTEED`; the web form additionally sets
 * the date input's `min` so this rarely reaches the api.
 */
export const CLAIM_DATE_BEFORE_DEPARTURE = 'CLAIM_DATE_BEFORE_DEPARTURE' as const;

/**
 * Grace window (milliseconds) for the past-departure rule. A `departureAt` up to
 * this far before "now" is still accepted, so a carrier who picks the current
 * moment and submits a little later (form fill-in time) is not rejected. The
 * guard rejects only when `departureAt < now - DEPARTURE_PAST_GRACE_MS`. BOTH
 * layers read this single constant — the api guard (`_assertDepartureNotInPast`)
 * and the web form (the pre-submit check + the `min` hint) — so the window can
 * never drift between client and server.
 */
export const DEPARTURE_PAST_GRACE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Response for `GET /delegations/eligibility` (carrier role). A single boolean
 * — `canCreate` — mirrors the same readiness computation that hard-blocks
 * `POST /delegations`. No breakdown is exposed to the carrier by design; the
 * carrier portal uses this only to enable/disable the new-delegation CTA.
 */
export const DelegationEligibilityResponseSchema = z
  .object({
    canCreate: z.boolean(),
  })
  .strict();
export type DelegationEligibilityResponse = z.infer<
  typeof DelegationEligibilityResponseSchema
>;

// ─── Filters ─────────────────────────────────────────────

export const DelegationFiltersSchema = z
  .object({
    status: DelegationStatusSchema.optional(),
    carrierId: UuidSchema.optional(),
    vehicleId: UuidSchema.optional(),
    driverId: UuidSchema.optional(),
    /** ISO datetime — match delegations whose `departureAt` ≥ from. */
    from: IsoDateTimeSchema.optional(),
    /** ISO datetime — match delegations whose `departureAt` ≤ to. */
    to: IsoDateTimeSchema.optional(),
    q: z.string().min(1).max(64).optional(),
    /**
     * Phase 7 — eksport/weryfikator history toggle. These two roles see the
     * ACTIVE board by default (`status IN {zgloszony, w_trasie}`); flipping
     * `includeHistory=true` widens the result to all statuses (incl. `zjechal`
     * / `anulowany`). Coerced from the query string (`"true"`/`"false"`).
     *
     * Scope note: this flag is ONLY consulted inside the eksport/weryfikator
     * branch of `DelegationsService._scopeListFilters`. For every other role
     * (carrier / planista / dyspozytor / admin / opiekun) it is a no-op — those
     * panels continue to return all statuses unconditionally, so this cannot
     * regress their lists. See the service for the exact mechanism.
     */
    includeHistory: z.coerce.boolean().optional(),
    /**
     * Phase 7 REWORK (2026-06-20 #4) — carrier «claimable wyjazdy» picker. When
     * `true`, narrows the carrier's list to outings that can back a NEW wniosek:
     * status === `zjechal` AND no claim linked yet. A wniosek can only be filed
     * for a RETURNED outing (its period + times + mileage are only final once the
     * weryfikator has captured the actual departure/return datetimes), so
     * `w_trasie` outings are NO LONGER claimable. The carrier `claims/new` form
     * fetches `GET /delegations?claimable=true` to populate the wyjazd selector.
     * Coerced from the query string. A no-op for non-carrier roles (the scope
     * branch only honours it for `przewoznik`).
     */
    claimable: z.coerce.boolean().optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type DelegationFilters = z.infer<typeof DelegationFiltersSchema>;

// ─── Mini-references ─────────────────────────────────────

// Declared BEFORE VehicleMiniSchema — it is referenced there (`planner`), and
// `const` initialisers evaluate top-to-bottom at module load (TDZ).
const UserMiniSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
});

const VehicleMiniSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
  /**
   * "Porozumienie" — whether the vehicle is currently under km-guarantee.
   * Mirrors Prisma `Vehicle.agreement` (`Boolean?`), so it is NULLABLE here.
   * NON-SENSITIVE (it is NOT a rate) → safe to surface to the carrier. Drives
   * the claims-picker "(bez gwarancji)" marker on the web wyjazd selector;
   * `null` AND `false` both mean NOT guaranteed (the claims gate accepts only
   * `agreement === true`).
   */
  agreement: z.boolean().nullable(),
  /**
   * The vehicle's four negotiated km-guarantee rates (EUR/km), mirrored LIVE
   * from `Vehicle.{rateDe,rateUe,rateExport,rateImport}` (Prisma `Decimal?`,
   * surfaced here as `number | null`). Same four fields the full `VehicleDto`
   * carries (see `packages/shared/src/schemas/vehicles.ts`). They power the
   * «Stawki» block in `DelegationDetailModal` (rendered between «Trasa» and
   * «Pojazd i kierowca»).
   *
   * SENSITIVE — commercial data. Unlike `dispatchTeam` / `planner` (pure
   * identity), rates are scrubbed to `null` SERVER-SIDE for the `dyspozytor`
   * role (the only delegation-reading role excluded from rates — see
   * docs/14-design-system.md §6.4.2 / §6.15; planista joined the rates-visible
   * group on 2026-06-26). Every other role that can read a delegation (admin,
   * planista, przewoznik, eksport, weryfikator, opiekun) receives the real
   * values; a carrier only ever reads its OWN delegations → its own vehicle's
   * rates, consistent with §6.15. This is deliberately STRONGER than the
   * UI-only exclusion on `VehicleDto` — here the wire payload matches
   * visibility, so there is no IDOR leak. A field is ALSO `null` when the
   * vehicle simply has no negotiated rate for that lane.
   */
  rateDe: z.number().nullable(),
  rateUe: z.number().nullable(),
  rateExport: z.number().nullable(),
  rateImport: z.number().nullable(),
  /**
   * Phase 11 Шаг D (additive) — the vehicle's CURRENT dispatch team, resolved
   * LIVE from `Vehicle.dispatchTeam` (NOT a snapshot). Identical shape to the
   * one surfaced by `VehicleDto` / `VehicleListItem` (reuses the shared
   * `VehicleDispatchTeamSchema`). Identity only — NON-SENSITIVE (not a rate),
   * safe for every role that already sees the delegation. `null` when the
   * vehicle is not assigned to any team. Powers the «ZESPÓŁ PROWADZĄCY» block
   * in `DelegationDetailModal`.
   */
  dispatchTeam: VehicleDispatchTeamSchema.nullable(),
  /**
   * The vehicle's CURRENT lead forwarder (`Vehicle.planner`, resolved LIVE —
   * not a snapshot), same UserMini shape as `reportedBy`/`readyBy`. Completes
   * the «ZESPÓŁ PROWADZĄCY» block in `DelegationDetailModal` (planista +
   * dispatch team + eksport). Identity only (not a rate) → NON-SENSITIVE.
   * `null` when the vehicle has no planner assigned.
   */
  planner: UserMiniSchema.nullable(),
});

const TrailerMiniSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
});

const DriverMiniSchema = z.object({
  id: UuidSchema,
  firstName: z.string(),
  lastName: z.string(),
});

const CarrierMiniSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
});

// ─── Response DTO ────────────────────────────────────────

export const DelegationDtoSchema = z.object({
  id: UuidSchema,

  vehicleId: UuidSchema,
  vehicle: VehicleMiniSchema.nullable(),
  // NOT NULL post-migration.
  trailerId: UuidSchema,
  trailer: TrailerMiniSchema.nullable(),
  driverId: UuidSchema,
  driver: DriverMiniSchema.nullable(),

  carrierId: UuidSchema,
  carrier: CarrierMiniSchema.nullable(),

  driverNameSnapshot: z.string().nullable(),
  driverPhoneSnapshot: z.string().nullable(),

  departureAt: IsoDateTimeSchema,
  departureCountry: z.string(),
  departurePostalCode: z.string(),

  // All return-planning fields NOT NULL post-migration.
  plannedReturnAt: IsoDateSchema,
  returnCountry: z.string(),
  returnPostalCode: z.string(),

  status: DelegationStatusSchema,
  /**
   * Actual start of the guarantee period — the exact MOMENT the vehicle really
   * started driving, captured by the weryfikator (as a full datetime) on the
   * `gotowy → w_trasie` transition (`POST /delegations/:id/in-transit`). `null`
   * until the outing goes `w_trasie`. The linked wniosek's `dateStart` derives
   * from its DAY and `timeFrom` from its wall-clock `HH:mm`.
   */
  actualDepartureAt: IsoDateTimeSchema.nullable(),
  /**
   * Actual moment the vehicle returned — captured by the weryfikator (as a full
   * datetime) on the `w_trasie → zjechal` transition
   * (`POST /delegations/:id/returned`). `null` until the outing goes `zjechal`.
   * The linked wniosek's `dateEnd` derives from its DAY and `timeTo` from its
   * wall-clock `HH:mm`.
   */
  actualReturnAt: IsoDateTimeSchema.nullable(),

  reportedById: UuidSchema.nullable(),
  reportedBy: UserMiniSchema.nullable(),
  reportedAt: IsoDateTimeSchema,
  verifiedById: UuidSchema.nullable(),
  verifiedBy: UserMiniSchema.nullable(),
  verifiedAt: IsoDateTimeSchema.nullable(),
  // Eksport who marked the outing `gotowy`. Shown in the modal as the
  // "zweryfikowany" actor (the export coordinator readying the load IS the
  // verification step in MAGTRANS).
  readyById: UuidSchema.nullable(),
  readyBy: UserMiniSchema.nullable(),
  readyAt: IsoDateTimeSchema.nullable(),
  /**
   * "Nr zlecenia ze spedu" — the SpedTrans order number captured by the eksport
   * on the `zgloszony → gotowy` flip (`POST /delegations/:id/ready`). `null`
   * until the outing is readied; cleared back to `null` on rollback so a
   * re-advance must supply a fresh number. Sibling of the `readyBy*` fields.
   */
  spedOrderNumber: z.string().nullable(),

  notes: z.string().nullable(),

  /**
   * Phase 7 REWORK (2026-06-20 #4) — id of the wniosek filed against this outing
   * (`@unique` FK on the Claim side), or `null` when none. Lets the carrier
   * panel mark outings that already have a claim and drives the «claimable»
   * picker (those with `claimId === null` in {`w_trasie`, `zjechal`}).
   */
  claimId: UuidSchema.nullable(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DelegationDto = z.infer<typeof DelegationDtoSchema>;
