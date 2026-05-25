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
  IsoDateSchema,
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
  brand: emptyStringToUndefined(z.string().max(64).optional()),
  model: emptyStringToUndefined(z.string().max(64).optional()),
  year: z.number().int().min(1900).max(2100).optional(),
  equipment: emptyStringToUndefined(z.string().max(2_000).optional()),
  nextInspectionDate: emptyStringToUndefined(IsoDateSchema.optional()),
  belts: z.boolean().optional(),
  mats: z.boolean().optional(),
  innerLength: z.number().nonnegative().optional(),
  innerWidth: z.number().nonnegative().optional(),
  innerHeight: z.number().nonnegative().optional(),
  capacity: z.number().nonnegative().optional(),
  airSuspension: z.boolean().optional(),
  loadFromBack: z.boolean().optional(),
  loadFromSide: z.boolean().optional(),
  loadFromTop: z.boolean().optional(),
  slidingRoof: z.boolean().optional(),
  edschaSlidingRoof: z.boolean().optional(),
  certXl: z.boolean().optional(),
  multilock: z.boolean().optional(),
  notes: emptyStringToUndefined(z.string().max(2_000).optional()),
};

// ─── Create ──────────────────────────────────────────────

export const CreateTrailerSchema = z
  .object({
    carrierId: UuidSchema,
    plateNumber: PlateSchema,
    /** REQUIRED — Trailer.trailerTypeId is NOT NULL since phase-2 migration. */
    trailerTypeId: UuidSchema,
    active: z.boolean().optional(),
    ...trailerAttributeFields,
  })
  .strict();
export type CreateTrailerDto = z.infer<typeof CreateTrailerSchema>;

// ─── Update ──────────────────────────────────────────────

/**
 * PATCH /trailers/:id — `trailerTypeId` stays optional (omit = leave alone)
 * but loses `.nullable()` because null is no longer valid per the DB.
 */
export const UpdateTrailerSchema = z
  .object({
    plateNumber: PlateSchema.optional(),
    active: z.boolean().optional(),
    trailerTypeId: emptyStringToUndefined(UuidSchema.optional()),
    brand: emptyStringToUndefined(z.string().max(64).nullable().optional()),
    model: emptyStringToUndefined(z.string().max(64).nullable().optional()),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    equipment: emptyStringToUndefined(
      z.string().max(2_000).nullable().optional(),
    ),
    nextInspectionDate: emptyStringToUndefined(
      IsoDateSchema.nullable().optional(),
    ),
    belts: z.boolean().nullable().optional(),
    mats: z.boolean().nullable().optional(),
    innerLength: z.number().nonnegative().nullable().optional(),
    innerWidth: z.number().nonnegative().nullable().optional(),
    innerHeight: z.number().nonnegative().nullable().optional(),
    capacity: z.number().nonnegative().nullable().optional(),
    airSuspension: z.boolean().nullable().optional(),
    loadFromBack: z.boolean().nullable().optional(),
    loadFromSide: z.boolean().nullable().optional(),
    loadFromTop: z.boolean().nullable().optional(),
    slidingRoof: z.boolean().nullable().optional(),
    edschaSlidingRoof: z.boolean().nullable().optional(),
    certXl: z.boolean().nullable().optional(),
    multilock: z.boolean().nullable().optional(),
    notes: emptyStringToUndefined(z.string().max(2_000).nullable().optional()),
  })
  .strict();
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
  brand: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().int().nullable(),
  equipment: z.string().nullable(),
  nextInspectionDate: IsoDateSchema.nullable(),
  belts: z.boolean().nullable(),
  mats: z.boolean().nullable(),
  innerLength: z.number().nullable(),
  innerWidth: z.number().nullable(),
  innerHeight: z.number().nullable(),
  capacity: z.number().nullable(),
  airSuspension: z.boolean().nullable(),
  loadFromBack: z.boolean().nullable(),
  loadFromSide: z.boolean().nullable(),
  loadFromTop: z.boolean().nullable(),
  slidingRoof: z.boolean().nullable(),
  edschaSlidingRoof: z.boolean().nullable(),
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
