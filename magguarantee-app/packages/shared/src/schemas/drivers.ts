// Wave 3 — Drivers DTO contracts.
//
// Source of truth for `/api/v1/drivers/*` per docs/13-api-design.md#drivers
// and docs/04-data-model.md (Driver invariants: loginSlug globally unique with
// `-2`/`-3` suffix on collision, generated from firstName.lastName).
//
// Phase 2 migration `phase2_required_fields_carrier_driver_trailer` made
// `phone` and `driverLicenseNumber` NOT NULL — both are required on create
// and non-nullable in the response DTO.

import { z } from 'zod';

import {
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';

// ─── Field primitives ────────────────────────────────────

const NameSchema = z.string().min(1).max(64);
/** Phone — non-empty, max 32 chars (now NOT NULL in Driver per phase 2). */
const PhoneRequiredSchema = z.string().min(1).max(32);
/** Optional phone (e.g. `phone2`) — same length cap, allows undefined. */
const PhoneOptionalSchema = z.string().min(1).max(32);
const EmailSchema = z.string().email().max(160);
const DriverLicenseSchema = z.string().min(1).max(64);

// ─── Create ──────────────────────────────────────────────

/**
 * POST /drivers — `carrierId` is optional in the body; if omitted (e.g. when
 * a carrier user posts), the service falls back to `currentUser.carrierProfile.id`
 * per the spec. `loginSlug` is server-generated from `firstName.lastName`.
 *
 * `phone` and `driverLicenseNumber` are required since the phase-2 migration
 * made the underlying columns NOT NULL.
 */
export const CreateDriverSchema = z
  .object({
    carrierId: UuidSchema.optional(),
    firstName: NameSchema,
    lastName: NameSchema,
    phone: PhoneRequiredSchema,
    phone2: emptyStringToUndefined(PhoneOptionalSchema.optional()),
    // email + bankAccount are optional — many PL drivers don't have an
    // email address; bankAccount is carrier-internal HR (carrier pays
    // driver, not MAGTRANS). licenseExpiry is REQUIRED at the API layer
    // because driving without a valid license is illegal — the column itself
    // is nullable to tolerate migrations/imports.
    email: emptyStringToUndefined(EmailSchema.optional()),
    driverLicenseNumber: DriverLicenseSchema,
    licenseExpiry: IsoDateSchema,
    bankAccount: emptyStringToUndefined(z.string().max(64).optional()),
    notes: emptyStringToUndefined(z.string().max(2_000).optional()),
    active: z.boolean().optional(),
  })
  .strict();
export type CreateDriverDto = z.infer<typeof CreateDriverSchema>;

// ─── Update ──────────────────────────────────────────────

/**
 * PATCH /drivers/:id — every field optional. Required-on-create columns
 * (`phone`, `driverLicenseNumber`) drop the `.nullable()` they used to have
 * because the DB no longer accepts NULL there. Empty form strings are
 * coerced to `undefined` (i.e. "leave field unchanged").
 */
export const UpdateDriverSchema = z
  .object({
    firstName: emptyStringToUndefined(NameSchema.optional()),
    lastName: emptyStringToUndefined(NameSchema.optional()),
    phone: emptyStringToUndefined(PhoneRequiredSchema.optional()),
    phone2: emptyStringToUndefined(PhoneOptionalSchema.nullable().optional()),
    // The following three fields are NOT NULL since phase3_blocks. PATCH
    // accepts an update (omit means "do not touch") but cannot null them.
    email: emptyStringToUndefined(EmailSchema.optional()),
    driverLicenseNumber: emptyStringToUndefined(DriverLicenseSchema.optional()),
    licenseExpiry: emptyStringToUndefined(IsoDateSchema.optional()),
    bankAccount: emptyStringToUndefined(z.string().max(64).optional()),
    notes: emptyStringToUndefined(z.string().max(2_000).nullable().optional()),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateDriverDto = z.infer<typeof UpdateDriverSchema>;

// ─── Filters ─────────────────────────────────────────────

export const DriverFiltersSchema = z
  .object({
    carrierId: UuidSchema.optional(),
    active: z.coerce.boolean().optional(),
    q: z.string().min(1).max(64).optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type DriverFilters = z.infer<typeof DriverFiltersSchema>;

// ─── Response DTO ────────────────────────────────────────

export const DriverDtoSchema = z.object({
  id: UuidSchema,
  carrierId: UuidSchema,
  loginSlug: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  phone2: z.string().nullable(),
  // Nullable per phase3_blocks audit revert.
  email: z.string().email().nullable(),
  driverLicenseNumber: z.string(),
  licenseExpiry: IsoDateSchema.nullable(),
  bankAccount: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  carrier: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DriverDto = z.infer<typeof DriverDtoSchema>;
