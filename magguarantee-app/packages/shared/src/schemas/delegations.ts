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

// ─── Enum mirror (Prisma DelegationStatus) ───────────────

export const DelegationStatusSchema = z.enum([
  'zgloszony',
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

// ─── Weryfikator transitions (Phase 7) ───────────────────

/**
 * POST /delegations/:id/in-transit — `weryfikator | admin` flips a
 * `zgloszony` outing to `w_trasie`. No body fields: the transition stamps
 * `verifiedBy/At` server-side from the JWT + clock. `.strict({})` rejects any
 * stray payload so a typo on the client surfaces as 422 rather than being
 * silently dropped (matches the empty-body convention elsewhere in the API).
 */
export const MarkInTransitSchema = z.object({}).strict();
export type MarkInTransitDto = z.infer<typeof MarkInTransitSchema>;

/**
 * POST /delegations/:id/returned — `weryfikator | admin` flips a `w_trasie`
 * outing to `zjechal`. Requires the real return DAY (`actualReturnAt`).
 *
 * `actualReturnAt` is **date-only** (`YYYY-MM-DD`), reusing `IsoDateSchema` —
 * the exact same convention as `plannedReturnAt` (owner decision 2026-06-10,
 * docs/20-phase-7-eksport-weryfikator.md §4.2). The service parses it the same
 * way `plannedReturnAt` is parsed (`new Date('YYYY-MM-DD')` → UTC midnight, in
 * lockstep with the `@db.Date` round-trip) and mirrors it into
 * `vehicle.lastDroveAt`. Time-of-day is intentionally NOT collected.
 */
export const MarkReturnedSchema = z
  .object({
    actualReturnAt: IsoDateSchema,
  })
  .strict();
export type MarkReturnedDto = z.infer<typeof MarkReturnedSchema>;

/**
 * Client-side form schema for the weryfikator «Oznacz zjechał» dialog (Phase 7,
 * web). The wire contract is `MarkReturnedSchema` (date-only, required); this
 * factory layers the **soft** sanity guards the DS asks the UI to surface
 * inline (docs/14-design-system.md §7.1):
 *   - `actualReturnAt` is required (empty → «Podaj datę zjazdu»),
 *   - not in the future relative to `today` (a verifier records a return that
 *     has already happened),
 *   - not earlier than the row's `departureAt` day (a return can't precede the
 *     departure).
 *
 * These are convenience guards only — the backend re-validates the transition
 * regardless (never trusts the client clock). `departureAt` is the row's
 * (timestamped) departure; only its date portion is compared. `today` is
 * injected (`YYYY-MM-DD`) so the schema stays pure/testable. The messages are
 * carried as Zod `message` strings here so the resolver can map them; the web
 * form swaps them for i18n copy by error `code`/`path` where needed.
 */
export function makeMarkReturnedFormSchema(opts: {
  departureAt?: string | null;
  today: string;
}) {
  const departureDay = opts.departureAt ? opts.departureAt.slice(0, 10) : null;
  return z
    .object({
      actualReturnAt: IsoDateSchema,
    })
    .strict()
    .superRefine((obj, ctx) => {
      if (obj.actualReturnAt > opts.today) {
        ctx.addIssue({
          path: ['actualReturnAt'],
          code: z.ZodIssueCode.custom,
          message: 'future',
        });
      }
      if (departureDay && obj.actualReturnAt < departureDay) {
        ctx.addIssue({
          path: ['actualReturnAt'],
          code: z.ZodIssueCode.custom,
          message: 'beforeDeparture',
        });
      }
    });
}
export type MarkReturnedFormValues = { actualReturnAt: string };

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
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type DelegationFilters = z.infer<typeof DelegationFiltersSchema>;

// ─── Mini-references ─────────────────────────────────────

const VehicleMiniSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
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

const UserMiniSchema = z.object({
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
  actualReturnAt: IsoDateTimeSchema.nullable(),

  reportedById: UuidSchema.nullable(),
  reportedBy: UserMiniSchema.nullable(),
  reportedAt: IsoDateTimeSchema,
  verifiedById: UuidSchema.nullable(),
  verifiedBy: UserMiniSchema.nullable(),
  verifiedAt: IsoDateTimeSchema.nullable(),

  notes: z.string().nullable(),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DelegationDto = z.infer<typeof DelegationDtoSchema>;
