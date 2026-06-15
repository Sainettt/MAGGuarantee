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

/**
 * Optional trailer attributes (excluding `trailerTypeId` which is now
 * required and lives on the create schema directly).
 */
const trailerAttributeFields = {
  belts: z.boolean().optional(),
  // `.nullable()` (matching UpdateTrailerSchema): the create form can hold a
  // `null` count (e.g. a hydrated draft, or RHF clearing the conditionally
  // rendered input) while its checkbox is OFF. Without nullable the base
  // `z.number()` rejects null with "Expected number, received null" on the
  // count field even when the checkbox was never touched — the validation
  // fails before the cross-field refine (which already null-checks) can ignore
  // it. `cleanForm` strips null before the request, so the wire payload is
  // unchanged. See trailerCountsRefine for the "checked ⇒ count required" rule.
  beltsCount: z.number().int().min(0).nullable().optional(),
  mats: z.boolean().optional(),
  matsCount: z.number().int().min(0).nullable().optional(),
  innerLength: z.number().nonnegative().optional(),
  innerWidth: z.number().nonnegative().optional(),
  innerHeight: z.number().nonnegative().optional(),
  capacity: z.number().nonnegative().optional(),
  airSuspension: z.boolean().optional(),
  certXl: z.boolean().optional(),
  multilock: z.boolean().optional(),
  notes: emptyStringToUndefined(z.string().max(2_000).optional()),
};

// ─── Conditional rules ───────────────────────────────────

/**
 * Shared cross-field rule used by both create and update: when `belts` /
 * `mats` is explicitly set to `true`, the matching count field must be
 * provided. Extracted as a function (not chained via `.superRefine`) so
 * callers can compose it onto a `.passthrough()` schema without losing
 * the underlying ZodObject — `ZodEffects` doesn't expose `.passthrough()`.
 */
export const trailerCountsRefine = (
  d: {
    belts?: boolean | null;
    beltsCount?: number | null;
    mats?: boolean | null;
    matsCount?: number | null;
  },
  ctx: z.RefinementCtx,
): void => {
  if (d.belts === true && (d.beltsCount === undefined || d.beltsCount === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'beltsCount wymagany gdy belts=true',
      path: ['beltsCount'],
    });
  }
  if (d.mats === true && (d.matsCount === undefined || d.matsCount === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'matsCount wymagany gdy mats=true',
      path: ['matsCount'],
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
    belts: z.boolean().nullable().optional(),
    beltsCount: z.number().int().min(0).nullable().optional(),
    mats: z.boolean().nullable().optional(),
    matsCount: z.number().int().min(0).nullable().optional(),
    innerLength: z.number().nonnegative().nullable().optional(),
    innerWidth: z.number().nonnegative().nullable().optional(),
    innerHeight: z.number().nonnegative().nullable().optional(),
    capacity: z.number().nonnegative().nullable().optional(),
    airSuspension: z.boolean().nullable().optional(),
    certXl: z.boolean().nullable().optional(),
    multilock: z.boolean().nullable().optional(),
    notes: emptyStringToUndefined(z.string().max(2_000).nullable().optional()),
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
  innerLength: z.number().nullable(),
  innerWidth: z.number().nullable(),
  innerHeight: z.number().nullable(),
  capacity: z.number().nullable(),
  airSuspension: z.boolean().nullable(),
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
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TrailerDto = z.infer<typeof TrailerDtoSchema>;
