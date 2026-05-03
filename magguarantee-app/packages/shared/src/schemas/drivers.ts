// Wave 3 — Drivers DTO contracts.
//
// Source of truth for `/api/v1/drivers/*` per docs/13-api-design.md#drivers
// and docs/04-data-model.md (Driver invariants: loginSlug globally unique with
// `-2`/`-3` suffix on collision, generated from firstName.lastName).

import { z } from 'zod';

import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from './common';

// ─── Field primitives ────────────────────────────────────

const NameSchema = z.string().min(1).max(64);
const PhoneSchema = z.string().max(32);
const EmailSchema = z.string().email().max(160);

// ─── Create ──────────────────────────────────────────────

/**
 * POST /drivers — `carrierId` is optional in the body; if omitted (e.g. when
 * a carrier user posts), the service falls back to `currentUser.carrierProfile.id`
 * per the spec. `loginSlug` is server-generated from `firstName.lastName`.
 */
export const CreateDriverSchema = z
  .object({
    carrierId: UuidSchema.optional(),
    firstName: NameSchema,
    lastName: NameSchema,
    phone: PhoneSchema.optional(),
    phone2: PhoneSchema.optional(),
    email: EmailSchema.optional(),
    driverLicenseNumber: z.string().max(64).optional(),
    licenseExpiry: IsoDateSchema.optional(),
    bankAccount: z.string().max(64).optional(),
    notes: z.string().max(2_000).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type CreateDriverDto = z.infer<typeof CreateDriverSchema>;

// ─── Update ──────────────────────────────────────────────

export const UpdateDriverSchema = z
  .object({
    firstName: NameSchema.optional(),
    lastName: NameSchema.optional(),
    phone: PhoneSchema.nullable().optional(),
    phone2: PhoneSchema.nullable().optional(),
    email: EmailSchema.nullable().optional(),
    driverLicenseNumber: z.string().max(64).nullable().optional(),
    licenseExpiry: IsoDateSchema.nullable().optional(),
    bankAccount: z.string().max(64).nullable().optional(),
    notes: z.string().max(2_000).nullable().optional(),
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
  phone: z.string().nullable(),
  phone2: z.string().nullable(),
  email: z.string().email().nullable(),
  driverLicenseNumber: z.string().nullable(),
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
