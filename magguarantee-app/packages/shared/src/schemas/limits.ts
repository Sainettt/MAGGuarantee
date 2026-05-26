// Phase 4.5 — MonthlyLimit DTO contracts.
//
// Source of truth for `/api/v1/limits/*` per docs/13-api-design.md#limits.
// `GET /limits?year=2026` returns the raw rows; the frontend handles
// gap-filling for months without explicit data. `PUT /limits/:yearMonth`
// upserts a single row by composite `(year, month)`.
//
// The Prisma column types are Decimal(8,2) for `kmPerDay` and Decimal(6,4)
// for `ratePerKm`. We don't pin the same scale on the wire: numbers come in
// as user input (form coercion via `z.coerce.number()`) and Prisma rounds to
// the column scale on insert.

import { z } from 'zod';

import { UuidSchema } from './common';

/**
 * Read-row shape of `monthly_limits`. Returned by `GET /limits?year=...`.
 *
 * Decimal columns surface as `number` in JSON. Both rate columns are
 * nullable in the schema — admin may seed one without the other.
 */
export const MonthlyLimitDtoSchema = z.object({
  id: UuidSchema,
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  kmPerDay: z.number().nullable(),
  ratePerKm: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MonthlyLimitDto = z.infer<typeof MonthlyLimitDtoSchema>;

export const MonthlyLimitListSchema = z.array(MonthlyLimitDtoSchema);
export type MonthlyLimitListDto = z.infer<typeof MonthlyLimitListSchema>;

/**
 * Query-param schema for `GET /limits?year=YYYY`. Year is required; the
 * service returns the (≤12) rows matching `year`. Range is generous on
 * purpose — the schema has no business reason to cap historical years.
 */
export const ListMonthlyLimitsFiltersSchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
  })
  .strict();
export type ListMonthlyLimitsFilters = z.infer<
  typeof ListMonthlyLimitsFiltersSchema
>;

/**
 * Body schema for `PUT /limits/:yearMonth`. At least one of the two fields
 * must be present (full row replace is intentionally not supported — the
 * UI surfaces inputs one at a time and a no-op PUT is meaningless).
 *
 * Both fields are positive decimals; the schema does NOT enforce the column
 * scale (Decimal(8,2) / Decimal(6,4)) — Prisma rounds on persist, which
 * matches the existing seed/import pipeline.
 */
export const UpdateMonthlyLimitSchema = z
  .object({
    kmPerDay: z.coerce.number().positive().optional(),
    ratePerKm: z.coerce.number().positive().optional(),
  })
  .refine((v) => v.kmPerDay !== undefined || v.ratePerKm !== undefined, {
    message:
      'At least one of `kmPerDay` or `ratePerKm` must be provided.',
  });
export type UpdateMonthlyLimitDto = z.infer<typeof UpdateMonthlyLimitSchema>;

/**
 * Path-param schema for `PUT /limits/:yearMonth`. The path carries a
 * `YYYY-MM` token; the service parses it into `{year, month}` after Zod
 * validates the textual shape. Two-digit month is required so the URL is
 * stable (`2026-5` is rejected — must be `2026-05`).
 */
export const YearMonthParamSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/u, {
    message: 'yearMonth must be in `YYYY-MM` format (e.g. `2026-05`).',
  });
export type YearMonthParam = z.infer<typeof YearMonthParamSchema>;
