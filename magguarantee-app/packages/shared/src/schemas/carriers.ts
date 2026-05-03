// Wave 3 — Carriers DTO contracts.
//
// Source of truth for `/api/v1/carriers/*` per docs/13-api-design.md#carriers
// and docs/04-data-model.md (Carrier extension of User, opiekunId invariants).

import { z } from 'zod';

import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from './common';

// ─── Field primitives shared by create/update ────────────

const LoginSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, {
    message: 'login may contain only letters, digits, dot, hyphen, underscore',
  });

const NameSchema = z.string().min(1).max(128);
const EmailSchema = z.string().email().max(160);

const carrierProfileFields = {
  nip: z.string().min(1).max(32).optional(),
  vatId: z.string().min(1).max(32).optional(),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().max(64).optional(),
  ordersEmail: EmailSchema.optional(),
  /** EUR IBAN. We don't enforce ISO format here — Phase 4 adds VIES/IBAN check. */
  accountEur: z.string().max(64).optional(),
  accountPln: z.string().max(64).optional(),
  paymentTerms: z.number().int().nonnegative().max(365).optional(),
  insuranceValue: z.number().nonnegative().optional(),
  insuranceExpiry: IsoDateSchema.optional(),
  licenseExpiry: IsoDateSchema.optional(),
  numberOfPermits: z.number().int().nonnegative().max(10_000).optional(),
  companyAddress: z.string().max(500).optional(),
  /** opiekun (User with role='opiekun') — service validates the role. */
  opiekunId: UuidSchema.optional(),
};

// ─── Create ──────────────────────────────────────────────

/**
 * POST /carriers — provisions a `User(role=przewoznik)` and a `Carrier` row
 * in the same transaction. `password` is optional; when omitted the API
 * generates one and returns it as `temporaryPassword` (Phase 2 stub).
 *
 * For role=opiekun callers the service auto-fills `opiekunId = user.sub` if
 * it isn't supplied — see CarriersService._resolveOpiekunId.
 */
export const CreateCarrierSchema = z
  .object({
    login: LoginSchema,
    email: EmailSchema,
    name: NameSchema,
    company: z.string().max(255).optional(),
    password: z.string().min(10).max(128).optional(),
    ...carrierProfileFields,
  })
  .strict();
export type CreateCarrierDto = z.infer<typeof CreateCarrierSchema>;

// ─── Update ──────────────────────────────────────────────

/**
 * PATCH /carriers/:id — every field optional. `login` cannot be changed
 * (login is the carrier's stable identifier); to swap it admin should
 * deactivate + create new.
 */
export const UpdateCarrierSchema = z
  .object({
    email: EmailSchema.optional(),
    name: NameSchema.optional(),
    company: z.string().max(255).nullable().optional(),
    nip: z.string().min(1).max(32).nullable().optional(),
    vatId: z.string().min(1).max(32).nullable().optional(),
    contactPerson: z.string().max(255).nullable().optional(),
    phone: z.string().max(64).nullable().optional(),
    ordersEmail: EmailSchema.nullable().optional(),
    accountEur: z.string().max(64).nullable().optional(),
    accountPln: z.string().max(64).nullable().optional(),
    paymentTerms: z.number().int().nonnegative().max(365).nullable().optional(),
    insuranceValue: z.number().nonnegative().nullable().optional(),
    insuranceExpiry: IsoDateSchema.nullable().optional(),
    licenseExpiry: IsoDateSchema.nullable().optional(),
    numberOfPermits: z
      .number()
      .int()
      .nonnegative()
      .max(10_000)
      .nullable()
      .optional(),
    companyAddress: z.string().max(500).nullable().optional(),
    opiekunId: UuidSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateCarrierDto = z.infer<typeof UpdateCarrierSchema>;

// ─── Filters ─────────────────────────────────────────────

export const CarrierFiltersSchema = z
  .object({
    /** UUID of an opiekun User; admin/pracownik only — opiekun is implicit. */
    opiekunId: UuidSchema.optional(),
    active: z.coerce.boolean().optional(),
    /** Substring search on login / name / nip. Case-insensitive in the repo. */
    q: z.string().min(1).max(64).optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type CarrierFilters = z.infer<typeof CarrierFiltersSchema>;

// ─── Response DTO ────────────────────────────────────────

export const CarrierDtoSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  login: z.string(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  active: z.boolean(),
  nip: z.string().nullable(),
  vatId: z.string().nullable(),
  contactPerson: z.string().nullable(),
  phone: z.string().nullable(),
  ordersEmail: z.string().email().nullable(),
  accountEur: z.string().nullable(),
  accountPln: z.string().nullable(),
  paymentTerms: z.number().int().nullable(),
  insuranceValue: z.number().nullable(),
  insuranceExpiry: IsoDateSchema.nullable(),
  licenseExpiry: IsoDateSchema.nullable(),
  numberOfPermits: z.number().int().nullable(),
  companyAddress: z.string().nullable(),
  opiekunId: UuidSchema.nullable(),
  opiekun: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CarrierDto = z.infer<typeof CarrierDtoSchema>;

/**
 * Response of POST /carriers and POST /carriers/:id/reset-password while
 * Phase 9's email pipeline is still pending. See UserWithTemporaryPassword
 * notes in `users.ts`.
 */
export const CarrierWithTemporaryPasswordSchema = CarrierDtoSchema.extend({
  temporaryPassword: z
    .string()
    .describe(
      '[dev-only — Phase 2] Plaintext password generated by the API. Will be replaced by email delivery in Phase 9.',
    ),
});
export type CarrierWithTemporaryPasswordDto = z.infer<
  typeof CarrierWithTemporaryPasswordSchema
>;
