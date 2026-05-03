// Wave 3 — Trailer Types DTO contracts.
//
// Source of truth for `/api/v1/trailer-types/*` per docs/13-api-design.md
// (admin-only). TrailerType is a global lookup table seeded by db-agent
// per docs/12-database-schema.md (Firanka, Plandeka, Chłodnia, …).

import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common';

const NameSchema = z.string().min(1).max(64);

export const CreateTrailerTypeSchema = z
  .object({
    name: NameSchema,
    shortCode: z.string().max(16).optional(),
    description: z.string().max(500).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type CreateTrailerTypeDto = z.infer<typeof CreateTrailerTypeSchema>;

export const UpdateTrailerTypeSchema = z
  .object({
    name: NameSchema.optional(),
    shortCode: z.string().max(16).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateTrailerTypeDto = z.infer<typeof UpdateTrailerTypeSchema>;

export const TrailerTypeFiltersSchema = z
  .object({
    active: z.coerce.boolean().optional(),
    q: z.string().min(1).max(64).optional(),
  })
  .strict();
export type TrailerTypeFilters = z.infer<typeof TrailerTypeFiltersSchema>;

export const TrailerTypeDtoSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  shortCode: z.string().nullable(),
  description: z.string().nullable(),
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TrailerTypeDto = z.infer<typeof TrailerTypeDtoSchema>;
