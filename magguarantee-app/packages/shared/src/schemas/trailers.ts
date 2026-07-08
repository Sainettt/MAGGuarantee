// Wave 3 — Trailers DTO contracts.
//
// Source of truth for `/api/v1/trailers/*` per docs/13-api-design.md#trailers
// and docs/04-data-model.md (composite (carrierId, plateNumber) uniqueness;
// trailerTypeId FK to TrailerType which must be active).
//
// Phase 2 migration `phase2_required_fields_carrier_driver_trailer` made
// `trailerTypeId` NOT NULL — required on create; non-nullable in the response.

import { z } from 'zod';

import {
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';

// ─── Field primitives ────────────────────────────────────

const PlateSchema = z.string().min(2).max(16);

/** Minimum count required for belts / mats / beams when their flag is true. */
const MIN_SECURING_COUNT = 3;

/**
 * Optional trailer attributes (excluding `trailerTypeId` and `sideClearanceCm`
 * which are required and live on the create schema directly).
 */
const trailerAttributeFields = {
  belts: z.boolean().optional(),
  // `.nullable()` (matching UpdateTrailerSchema): the create form can hold a
  // `null` count while its checkbox is OFF. See trailerCountsRefine for the
  // "checked ⇒ count required AND ≥3" rule.
  beltsCount: z.number().int().min(0).nullable().optional(),
  mats: z.boolean().optional(),
  matsCount: z.number().int().min(0).nullable().optional(),
  /** Belki zabezpieczające — mirrors belts/mats (checked ⇒ count ≥3). */
  beams: z.boolean().optional(),
  beamsCount: z.number().int().min(0).nullable().optional(),
  innerLength: z.number().nonnegative().optional(),
  innerWidth: z.number().nonnegative().optional(),
  innerHeight: z.number().nonnegative().optional(),
  capacity: z.number().nonnegative().optional(),
  /** Podnoszony dach (lifting roof). */
  liftingRoof: z.boolean().optional(),
  /** Odsuwany dach (sliding roof). `slidingRoof=true ⇒ edscha defined`. */
  slidingRoof: z.boolean().optional(),
  /** Edscha sliding-roof mechanism — meaningful only when slidingRoof=true. */
  edscha: z.boolean().optional(),
  /** Kosz paletowy (pallet box). */
  palletBox: z.boolean().optional(),
  certXl: z.boolean().optional(),
  multilock: z.boolean().optional(),
  notes: emptyStringToUndefined(z.string().max(2_000).optional()),
};

// ─── Conditional rules ───────────────────────────────────

/**
 * Shared cross-field rule used by both create and update:
 *  - `belts` / `mats` / `beams` = true ⇒ the matching count is provided AND
 *    ≥ {@link MIN_SECURING_COUNT} (was: merely required).
 *  - `slidingRoof` = true ⇒ `edscha` must be set (a defined boolean).
 *
 * Extracted as a function (not chained via `.superRefine`) so callers can
 * compose it onto a `.passthrough()` schema without losing the underlying
 * ZodObject — `ZodEffects` doesn't expose `.passthrough()`.
 */
export const trailerCountsRefine = (
  d: {
    belts?: boolean | null;
    beltsCount?: number | null;
    mats?: boolean | null;
    matsCount?: number | null;
    beams?: boolean | null;
    beamsCount?: number | null;
    slidingRoof?: boolean | null;
    edscha?: boolean | null;
  },
  ctx: z.RefinementCtx,
): void => {
  const assertMin = (
    flag: boolean | null | undefined,
    count: number | null | undefined,
    field: string,
  ): void => {
    if (flag !== true) return;
    if (count === undefined || count === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} wymagany gdy ${field.replace('Count', '')}=true`,
        path: [field],
      });
    } else if (count < MIN_SECURING_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} musi być ≥${MIN_SECURING_COUNT}`,
        path: [field],
      });
    }
  };
  assertMin(d.belts, d.beltsCount, 'beltsCount');
  assertMin(d.mats, d.matsCount, 'matsCount');
  assertMin(d.beams, d.beamsCount, 'beamsCount');
  if (d.slidingRoof === true && (d.edscha === undefined || d.edscha === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'edscha wymagany gdy slidingRoof=true',
      path: ['edscha'],
    });
  }
};

// ─── Create ──────────────────────────────────────────────

/** Underlying ZodObject — exported so callers can extend (e.g. passthrough). */
export const CreateTrailerObjectSchema = z
  .object({
    carrierId: UuidSchema,
    plateNumber: PlateSchema,
    /** REQUIRED — Trailer.trailerTypeId is NOT NULL since phase-2 migration. */
    trailerTypeId: UuidSchema,
    active: z.boolean().optional(),
    /** REQUIRED — Trailer.sideClearanceCm is NOT NULL (boczny prześwit, cm). */
    sideClearanceCm: z.number().int().min(0),
    ...trailerAttributeFields,
  })
  .strict();

export const CreateTrailerSchema =
  CreateTrailerObjectSchema.superRefine(trailerCountsRefine);
export type CreateTrailerDto = z.infer<typeof CreateTrailerSchema>;

// ─── Update ──────────────────────────────────────────────

/**
 * PATCH /trailers/:id — `trailerTypeId` stays optional (omit = leave alone)
 * but loses `.nullable()` because null is no longer valid per the DB.
 */
export const UpdateTrailerObjectSchema = z
  .object({
    plateNumber: PlateSchema.optional(),
    active: z.boolean().optional(),
    trailerTypeId: emptyStringToUndefined(UuidSchema.optional()),
    /** sideClearanceCm is NOT NULL — PATCH may change it but not null it. */
    sideClearanceCm: z.number().int().min(0).optional(),
    belts: z.boolean().nullable().optional(),
    beltsCount: z.number().int().min(0).nullable().optional(),
    mats: z.boolean().nullable().optional(),
    matsCount: z.number().int().min(0).nullable().optional(),
    beams: z.boolean().nullable().optional(),
    beamsCount: z.number().int().min(0).nullable().optional(),
    innerLength: z.number().nonnegative().nullable().optional(),
    innerWidth: z.number().nonnegative().nullable().optional(),
    innerHeight: z.number().nonnegative().nullable().optional(),
    capacity: z.number().nonnegative().nullable().optional(),
    liftingRoof: z.boolean().nullable().optional(),
    slidingRoof: z.boolean().nullable().optional(),
    edscha: z.boolean().nullable().optional(),
    palletBox: z.boolean().nullable().optional(),
    certXl: z.boolean().nullable().optional(),
    multilock: z.boolean().nullable().optional(),
    notes: emptyStringToUndefined(z.string().max(2_000).nullable().optional()),
    /**
     * Attachment ids to soft-delete as part of this update (multipart field
     * `removeAttachmentIds`). Web sends it as a JSON-encoded string part — the
     * controller coerces it before validation. Mirrors vehicles/drivers.
     */
    removeAttachmentIds: z.array(UuidSchema).max(64).optional(),
  })
  .strict();

export const UpdateTrailerSchema =
  UpdateTrailerObjectSchema.superRefine(trailerCountsRefine);
export type UpdateTrailerDto = z.infer<typeof UpdateTrailerSchema>;

// ─── Filters ─────────────────────────────────────────────

export const TrailerFiltersSchema = z
  .object({
    carrierId: UuidSchema.optional(),
    trailerTypeId: UuidSchema.optional(),
    active: z.coerce.boolean().optional(),
    q: z.string().min(1).max(64).optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type TrailerFilters = z.infer<typeof TrailerFiltersSchema>;

// ─── Attachments ─────────────────────────────────────────

/**
 * Category of a Trailer attachment, mirroring the DB
 * `enum TrailerAttachmentCategory`:
 *  - `cert_xl` — XL certificate (certyfikat XL / EN 12642-XL). Required when
 *    `Trailer.certXl=true`; MIME restricted to `application/pdf`.
 *
 * Single value for now — kept as an enum (not a literal) to mirror the
 * Vehicle/Driver/Carrier attachment pattern and stay extensible.
 */
export const TrailerAttachmentCategorySchema = z.enum(['cert_xl']);
export type TrailerAttachmentCategory = z.infer<
  typeof TrailerAttachmentCategorySchema
>;

/**
 * Public attachment DTO. NOTE: `storageKey` is deliberately omitted — it is
 * an internal MinIO object key and never leaves the API. Clients download
 * bytes via `GET /trailers/:id/attachments/:attachmentId/download`.
 */
export const TrailerAttachmentDtoSchema = z.object({
  id: UuidSchema,
  trailerId: UuidSchema,
  category: TrailerAttachmentCategorySchema,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  uploadedById: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type TrailerAttachmentDto = z.infer<typeof TrailerAttachmentDtoSchema>;

// ─── Response DTO ────────────────────────────────────────

export const TrailerDtoSchema = z.object({
  id: UuidSchema,
  carrierId: UuidSchema,
  plateNumber: z.string(),
  active: z.boolean(),
  trailerTypeId: UuidSchema,
  trailerType: z.object({
    id: UuidSchema,
    name: z.string(),
    shortCode: z.string().nullable(),
    active: z.boolean(),
  }),
  belts: z.boolean().nullable(),
  beltsCount: z.number().int().nullable(),
  mats: z.boolean().nullable(),
  matsCount: z.number().int().nullable(),
  beams: z.boolean().nullable(),
  beamsCount: z.number().int().nullable(),
  innerLength: z.number().nullable(),
  innerWidth: z.number().nullable(),
  innerHeight: z.number().nullable(),
  capacity: z.number().nullable(),
  /** Boczny prześwit ładunkowy (cm) — NOT NULL. */
  sideClearanceCm: z.number().int(),
  liftingRoof: z.boolean(),
  slidingRoof: z.boolean(),
  /** Meaningful only when slidingRoof=true; nullable otherwise. */
  edscha: z.boolean().nullable(),
  palletBox: z.boolean(),
  certXl: z.boolean().nullable(),
  multilock: z.boolean().nullable(),
  notes: z.string().nullable(),
  carrier: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  /** Non-deleted XL-certificate attachments for this trailer. */
  attachments: z.array(TrailerAttachmentDtoSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TrailerDto = z.infer<typeof TrailerDtoSchema>;
