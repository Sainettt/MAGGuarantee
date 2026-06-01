// Wave 3 — Drivers DTO contracts.
//
// Source of truth for `/api/v1/drivers/*` per docs/13-api-design.md#drivers
// and docs/04-data-model.md (Driver invariants: loginSlug globally unique with
// `-2`/`-3` suffix on collision, generated from firstName.lastName).
//
// Phase 2 migration `phase2_required_fields_carrier_driver_trailer` made
// `phone` and `idDocumentNumber` NOT NULL — both are required on create
// and non-nullable in the response DTO.
//
// 2026-05-28 — `driverLicenseNumber` was renamed to `passportNumber` (column
// rename in migration `20260528120000_driver_rename_license_to_passport`),
// then generalised to `idDocumentNumber` in migration
// `20260601130000_driver_rename_passport_to_id_document` — a driver may present
// any identity document (passport, national ID card / dowód osobisty, etc.).
// Validation rule unchanged: arbitrary string 1–64 chars (foreign drivers can
// have non-standard formats, we don't lock a regex).

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
/** Identity-document number (passport, national ID, etc.) — generic string. */
const IdDocumentNumberSchema = z.string().min(1).max(64);

// ─── Create ──────────────────────────────────────────────

/**
 * POST /drivers — `carrierId` is optional in the body; if omitted (e.g. when
 * a carrier user posts), the service falls back to `currentUser.carrierProfile.id`
 * per the spec. `loginSlug` is server-generated from `firstName.lastName`.
 *
 * `phone` and `idDocumentNumber` are required since the phase-2 migration
 * made the underlying columns NOT NULL.
 */
export const CreateDriverSchema = z
  .object({
    carrierId: UuidSchema.optional(),
    firstName: NameSchema,
    lastName: NameSchema,
    phone: PhoneRequiredSchema,
    phone2: emptyStringToUndefined(PhoneOptionalSchema.optional()),
    // email is optional — many PL drivers don't have an email address.
    // licenseExpiry is REQUIRED at the API layer because driving without a
    // valid license is illegal — the column itself is nullable to tolerate
    // migrations/imports.
    email: emptyStringToUndefined(EmailSchema.optional()),
    idDocumentNumber: IdDocumentNumberSchema,
    licenseExpiry: IsoDateSchema,
    notes: emptyStringToUndefined(z.string().max(2_000).optional()),
    active: z.boolean().optional(),
    /**
     * ADR transport permit flag (świadectwo ADR). When true the API
     * additionally requires an `adr` attachment (scanned ADR certificate) —
     * that cross-field rule lives in the service layer
     * (`DriversService._assertRequiredAttachmentsOnCreate` /
     * `_assertRequiredAttachmentsOnUpdate`), because the file arrives as a
     * separate multipart part and cannot be seen by Zod. Mirrors the cabotage
     * required-attachment pattern formerly on the vehicle.
     */
    adr: z.boolean().optional().default(false),
  })
  .strict();
export type CreateDriverDto = z.infer<typeof CreateDriverSchema>;

// ─── Update ──────────────────────────────────────────────

/**
 * PATCH /drivers/:id — every field optional. Required-on-create columns
 * (`phone`, `idDocumentNumber`) drop the `.nullable()` they used to have
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
    idDocumentNumber: emptyStringToUndefined(IdDocumentNumberSchema.optional()),
    licenseExpiry: emptyStringToUndefined(IsoDateSchema.optional()),
    notes: emptyStringToUndefined(z.string().max(2_000).nullable().optional()),
    active: z.boolean().optional(),
    /** Mirrors create — `adr=true` requires an `adr` attachment over the
     *  post-update set, enforced in the service layer. */
    adr: z.boolean().optional(),
    /**
     * Attachment ids to soft-delete as part of this update (multipart field
     * `removeAttachmentIds`). New files arrive as separate file parts; this
     * list names existing attachments to remove. Web sends it as a JSON-
     * encoded string part — the controller coerces it before validation.
     */
    removeAttachmentIds: z.array(UuidSchema).max(64).optional(),
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

// ─── Attachments ─────────────────────────────────────────

/**
 * Category of a Driver attachment, mirroring the DB
 * `enum DriverAttachmentCategory`:
 *  - `adr` — scanned ADR certificate (świadectwo ADR), required iff
 *            Driver.adr=true.
 *
 * Single value for now — kept as an enum (not a literal) to mirror the
 * Vehicle/Carrier attachment pattern and stay extensible.
 */
export const DriverAttachmentCategorySchema = z.enum(['adr']);
export type DriverAttachmentCategory = z.infer<
  typeof DriverAttachmentCategorySchema
>;

/**
 * Public attachment DTO. NOTE: `storageKey` is deliberately omitted — it is
 * an internal MinIO object key and never leaves the API. Clients download
 * bytes via `GET /drivers/:id/attachments/:attachmentId/download`.
 */
export const DriverAttachmentDtoSchema = z.object({
  id: UuidSchema,
  driverId: UuidSchema,
  category: DriverAttachmentCategorySchema,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  uploadedById: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type DriverAttachmentDto = z.infer<typeof DriverAttachmentDtoSchema>;

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
  idDocumentNumber: z.string(),
  licenseExpiry: IsoDateSchema.nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  /** ADR transport permit flag — required-attachment rule in the service. */
  adr: z.boolean(),
  carrier: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  /** Non-deleted ADR attachments for this driver. */
  attachments: z.array(DriverAttachmentDtoSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DriverDto = z.infer<typeof DriverDtoSchema>;
