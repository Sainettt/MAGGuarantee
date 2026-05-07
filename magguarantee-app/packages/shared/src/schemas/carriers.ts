// Wave 3 — Carriers DTO contracts.
//
// Source of truth for `/api/v1/carriers/*` per docs/13-api-design.md#carriers
// and docs/04-data-model.md (Carrier extension of User, opiekunId invariants).
//
// Phase 2 migration `phase2_required_fields_carrier_driver_trailer` made
// `phone` and `opiekunId` NOT NULL — both are required on create and
// non-nullable in the response DTO. Existing carrier UIs MUST send `opiekunId`
// explicitly; the service-side fallback for `role=opiekun` callers is kept as
// defense-in-depth but the schema layer enforces presence first.

import { z } from 'zod';

import {
  EuVatSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';
import { PolishNipSchema } from './integrations/whitelist';

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
const PhoneRequiredSchema = z.string().min(1).max(64);

const carrierProfileFields = {
  /** Polish NIP (10 digits) — optional for foreign carriers. */
  nip: emptyStringToUndefined(PolishNipSchema.max(32).optional()),
  /** EU VAT — country code + 2–12 alphanumeric. Optional for PL-only carriers. */
  vatId: emptyStringToUndefined(EuVatSchema.max(32).optional()),
  /** REQUIRED — Carrier.contactPerson is NOT NULL since phase3_blocks. */
  contactPerson: z.string().min(1).max(255),
  /** REQUIRED — Carrier.phone is NOT NULL since phase-2 migration. */
  phone: PhoneRequiredSchema,
  /** REQUIRED — Carrier.ordersEmail is NOT NULL since phase3_blocks. */
  ordersEmail: EmailSchema,
  /**
   * REQUIRED — Carrier.accountEur (IBAN) is NOT NULL since phase3_blocks.
   * We don't enforce ISO IBAN format here — Phase 4 adds VIES/IBAN check.
   */
  accountEur: z.string().min(1).max(64),
  accountPln: emptyStringToUndefined(z.string().max(64).optional()),
  /**
   * Defaults to 30 days at the DB level since phase3_blocks. Optional in the
   * Create DTO; required in the response DTO.
   */
  paymentTerms: z.number().int().nonnegative().max(365).optional().default(30),
  // Required at the API layer — admin onboarding must have insurance and
  // license documents in hand. The DB column itself is nullable to allow
  // backfills / imports / migration-time stubs without a CHECK violation;
  // the create endpoint enforces presence via this Zod schema.
  insuranceValue: z.number().nonnegative(),
  insuranceExpiry: IsoDateSchema,
  licenseExpiry: IsoDateSchema,
  numberOfPermits: z.number().int().nonnegative().max(10_000).optional(),
  /** REQUIRED — Carrier.companyAddress is NOT NULL since phase3_blocks. */
  companyAddress: z.string().min(1).max(500),
  /**
   * REQUIRED — Carrier.opiekunId is NOT NULL since phase-2 migration. UIs must
   * send it explicitly; the service still validates the referenced user has
   * role='opiekun' and is active.
   */
  opiekunId: UuidSchema,
};

// ─── Create ──────────────────────────────────────────────

/**
 * POST /carriers — provisions a `User(role=przewoznik)` and a `Carrier` row
 * in the same transaction. `password` is optional; when omitted the API
 * generates one and returns it as `temporaryPassword` (Phase 2 stub).
 */
export const CreateCarrierSchema = z
  .object({
    login: LoginSchema,
    email: EmailSchema,
    name: NameSchema,
    company: emptyStringToUndefined(z.string().max(255).optional()),
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
 *
 * `phone` and `opiekunId` are still optional in PATCH semantics (omit means
 * "do not touch"), but neither may be sent as `null` since the column is
 * NOT NULL.
 */
export const UpdateCarrierSchema = z
  .object({
    email: EmailSchema.optional(),
    name: NameSchema.optional(),
    company: emptyStringToUndefined(z.string().max(255).nullable().optional()),
    nip: emptyStringToUndefined(PolishNipSchema.max(32).nullable().optional()),
    vatId: emptyStringToUndefined(EuVatSchema.max(32).nullable().optional()),
    contactPerson: emptyStringToUndefined(
      z.string().max(255).nullable().optional(),
    ),
    phone: emptyStringToUndefined(PhoneRequiredSchema.optional()),
    ordersEmail: emptyStringToUndefined(EmailSchema.nullable().optional()),
    accountEur: emptyStringToUndefined(
      z.string().max(64).nullable().optional(),
    ),
    accountPln: emptyStringToUndefined(
      z.string().max(64).nullable().optional(),
    ),
    paymentTerms: z.number().int().nonnegative().max(365).nullable().optional(),
    insuranceValue: z.number().nonnegative().nullable().optional(),
    insuranceExpiry: emptyStringToUndefined(
      IsoDateSchema.nullable().optional(),
    ),
    licenseExpiry: emptyStringToUndefined(IsoDateSchema.nullable().optional()),
    numberOfPermits: z
      .number()
      .int()
      .nonnegative()
      .max(10_000)
      .nullable()
      .optional(),
    companyAddress: emptyStringToUndefined(
      z.string().max(500).nullable().optional(),
    ),
    opiekunId: emptyStringToUndefined(UuidSchema.optional()),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateCarrierDto = z.infer<typeof UpdateCarrierSchema>;

// ─── Filters ─────────────────────────────────────────────

export const CarrierFiltersSchema = z
  .object({
    /** UUID of an opiekun User; admin only — opiekun is implicit (auto-self-assigned). */
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
  // NOT NULL after phase3_blocks.
  email: z.string().email(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  active: z.boolean(),
  nip: z.string().nullable(),
  vatId: z.string().nullable(),
  // NOT NULL after phase3_blocks.
  contactPerson: z.string(),
  phone: z.string(),
  ordersEmail: z.string().email(),
  accountEur: z.string(),
  accountPln: z.string().nullable(),
  paymentTerms: z.number().int(),
  // Nullable per phase3_blocks_audit_revert.
  insuranceValue: z.number().nullable(),
  insuranceExpiry: IsoDateSchema.nullable(),
  licenseExpiry: IsoDateSchema.nullable(),
  numberOfPermits: z.number().int().nullable(),
  companyAddress: z.string(),
  opiekunId: UuidSchema,
  opiekun: z.object({
    id: UuidSchema,
    login: z.string(),
    name: z.string().nullable(),
  }),
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
