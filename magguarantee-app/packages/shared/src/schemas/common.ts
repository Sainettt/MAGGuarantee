// Reusable Zod primitives for the rest of the schemas folder.
//
// Convention: every domain gets its own file (`carriers.ts`, `vehicles.ts`,
// `drivers.ts`, `trailers.ts`, `claims.ts`, `delegations.ts`, `users.ts`,
// `audit.ts`). Each domain file imports the primitives from this module so
// IDs, datetimes and pagination params are spelled the same everywhere.
//
// This file is hand-curated. Please do not generate it from Prisma — the
// schemas here are wire contracts (DTOs), not database row types.

import { z } from 'zod';

// ─── Identifier primitives ────────────────────────────────

/** RFC-4122 UUID v4 (Postgres `gen_random_uuid()` default). */
export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

/** ISO 8601 datetime with offset. Matches Prisma `DateTime` JSON serialization. */
export const IsoDateTimeSchema = z.string().datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** ISO 8601 calendar date (no time). Matches Prisma `@db.Date` columns. */
export const IsoDateSchema = z.string().date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

// ─── Roles (mirror of Prisma enum) ────────────────────────

/**
 * Mirrors the `Role` enum in packages/database/prisma/schema.prisma.
 *
 * We deliberately don't import the Prisma enum here — that would drag the
 * generated client into the shared package. The literal list is the contract;
 * a CI check can later compare these strings against `Role` in the schema if
 * drift becomes a risk.
 *
 * NOTE: the auth slice has its own `Role` schema in `./auth.ts` for backward
 * compatibility. The two definitions MUST stay in sync; once Wave 3 lands
 * we'll consolidate to this single source of truth and re-export from auth.
 */
export const RoleSchema = z.enum([
  'admin',
  'pracownik',
  'opiekun',
  'planista',
  'dyspozytor',
  'przewoznik',
  'eksport',
  'weryfikator',
]);
export type RoleSchema = z.infer<typeof RoleSchema>;

// ─── Pagination & list query primitives ───────────────────

/**
 * Cursor-based pagination per docs/13-api-design.md#пагинация.
 *
 * `cursor` is the id of the last item in the previous page (UUID for most
 * lists; for `claims` it's the `nrZgl` string and that endpoint will compose
 * its own schema).
 */
export const PaginationParamsSchema = z.object({
  cursor: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

/**
 * Generic list-response envelope for cursor pagination. Use as
 *   `PaginatedResponse(MyItemSchema)`.
 */
export const PaginatedResponse = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: UuidSchema.nullable(),
    /** Optional total — only emitted when cheap (small filters). */
    total: z.number().int().nonnegative().optional(),
  });

// ─── Problem-details (RFC 7807) ───────────────────────────

/**
 * Shape of error responses across the API per docs/13-api-design.md#формат-ответов.
 * Useful client-side for typing the failure branch of API calls.
 */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.record(z.string(), z.string()).optional(),
  instance: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
