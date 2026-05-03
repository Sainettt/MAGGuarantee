// Wave 3 — Trailers DTO contracts.
//
// Source of truth for `/api/v1/trailers/*` per docs/13-api-design.md#trailers
// and docs/04-data-model.md (composite (carrierId, plateNumber) uniqueness;
// trailerTypeId optional FK to TrailerType which must be active).

import { z } from 'zod';

import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from './common';

// ─── Field primitives ────────────────────────────────────

const PlateSchema = z.string().min(2).max(16);

const trailerAttributeFields = {
  trailerTypeId: UuidSchema.optional(),
  brand: z.string().max(64).optional(),
  model: z.string().max(64).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  equipment: z.string().max(2_000).optional(),
  nextInspectionDate: IsoDateSchema.optional(),
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
  notes: z.string().max(2_000).optional(),
};

// ─── Create ──────────────────────────────────────────────

export const CreateTrailerSchema = z
  .object({
    carrierId: UuidSchema,
    plateNumber: PlateSchema,
    active: z.boolean().optional(),
    ...trailerAttributeFields,
  })
  .strict();
export type CreateTrailerDto = z.infer<typeof CreateTrailerSchema>;

// ─── Update ──────────────────────────────────────────────

export const UpdateTrailerSchema = z
  .object({
    plateNumber: PlateSchema.optional(),
    active: z.boolean().optional(),
    trailerTypeId: UuidSchema.nullable().optional(),
    brand: z.string().max(64).nullable().optional(),
    model: z.string().max(64).nullable().optional(),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    equipment: z.string().max(2_000).nullable().optional(),
    nextInspectionDate: IsoDateSchema.nullable().optional(),
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
    notes: z.string().max(2_000).nullable().optional(),
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
  trailerTypeId: UuidSchema.nullable(),
  trailerType: z
    .object({
      id: UuidSchema,
      name: z.string(),
      shortCode: z.string().nullable(),
      active: z.boolean(),
    })
    .nullable(),
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
