// Phase 3 — Delegations DTO contracts.
//
// Source of truth for `/api/v1/delegations/*` per docs/13-api-design.md
// and the `Delegation` model in packages/database/prisma/schema.prisma:392+.
//
// Delegations are vehicle outings: carrier registers (zgloszony), weryfikator
// flips to `w_trasie` and finally `zjechal`. Either party can move it to
// `anulowany` per the documented role rules — carrier may cancel only
// their own `zgloszony` rows, weryfikator may cancel anything.

import { z } from 'zod';

import {
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

const CountrySchema = z.string().min(2).max(8); // ISO 3166-1 alpha-2 or short label
const PostalSchema = z.string().min(1).max(16);

// ─── Submit (carrier) ────────────────────────────────────

/**
 * POST /delegations — body shape per docs/13-api-design.md§Delegations.
 *
 * Notes:
 * - `carrierId` is **derived from the JWT** — never accepted in the body.
 * - `vehicleId` ownership is enforced by the `CarrierOwnershipGuard`.
 * - `plannedReturnAt` may be omitted at submit time (carrier doesn't always
 *   know it yet); the weryfikator can edit it later.
 */
export const SubmitDelegationSchema = z
  .object({
    vehicleId: UuidSchema,
    trailerId: emptyStringToUndefined(UuidSchema.optional()),
    driverId: emptyStringToUndefined(UuidSchema.optional()),

    departureAt: IsoDateTimeSchema,
    departureCountry: emptyStringToUndefined(CountrySchema.optional()),
    departurePostalCode: emptyStringToUndefined(PostalSchema.optional()),

    plannedReturnAt: emptyStringToUndefined(IsoDateTimeSchema.optional()),
    returnCountry: emptyStringToUndefined(CountrySchema.optional()),
    returnPostalCode: emptyStringToUndefined(PostalSchema.optional()),

    /** Free-form note (e.g. cargo type, route hints). */
    comment: emptyStringToUndefined(z.string().max(2_000).optional()),
  })
  .strict()
  .refine(
    (v) => !v.plannedReturnAt || v.plannedReturnAt >= v.departureAt,
    {
      message: 'plannedReturnAt must be on or after departureAt',
      path: ['plannedReturnAt'],
    },
  );
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
  trailerId: UuidSchema.nullable(),
  trailer: TrailerMiniSchema.nullable(),
  driverId: UuidSchema.nullable(),
  driver: DriverMiniSchema.nullable(),

  carrierId: UuidSchema,
  carrier: CarrierMiniSchema.nullable(),

  driverNameSnapshot: z.string().nullable(),
  driverPhoneSnapshot: z.string().nullable(),

  departureAt: IsoDateTimeSchema,
  departureCountry: z.string().nullable(),
  departurePostalCode: z.string().nullable(),

  plannedReturnAt: IsoDateTimeSchema.nullable(),
  returnCountry: z.string().nullable(),
  returnPostalCode: z.string().nullable(),

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
