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

// ─── Form-friendly preprocessor ───────────────────────────

/**
 * Converts empty strings to `undefined` BEFORE the wrapped schema validates.
 * Use to wrap optional string fields fed from HTML form inputs — RHF stores
 * cleared inputs as `''` instead of `undefined`, which would otherwise trip
 * `.email()` / `.regex()` etc. on optional fields.
 *
 * Also coerces `null` → `undefined` so the same helper covers JSON payloads
 * where a deliberate "clear this field" might come in as null from PATCH.
 */
export const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema);

// ─── EU VAT format (generic — per-country regex omitted for MVP) ──

/**
 * EU VAT identifier: 2-letter country code + 2–12 alphanumeric characters.
 * We don't enforce per-country format here (PL is 10 digits, IE allows
 * letters, etc.) — Phase 4 VIES check authoritative confirms validity.
 *
 * NOT to be confused with `ViesVatSchema` in `./integrations/vies.ts` which
 * is just the *digits-only* portion of the VAT used as a path-param when
 * calling the VIES service.
 */
export const EuVatSchema = z
  .string()
  .regex(
    /^[A-Z]{2}[A-Za-z0-9]{2,12}$/,
    'VAT must be a country code (2 letters) followed by 2–12 alphanumeric characters',
  );
export type EuVat = z.infer<typeof EuVatSchema>;

/**
 * Generic tax-identification number — country-agnostic. Used by the carrier
 * `nip` field, which historically held a 10-digit Polish NIP but in practice
 * also receives foreign company tax IDs (Italian Codice Fiscale up to 16,
 * various EU TINs up to 14, US EIN 9 digits, etc.). We only enforce a sane
 * length range and an alphanumeric class — country-specific format rules
 * (PL=10 digits, etc.) are still applied per-flow at the integration layer
 * (e.g. Biała Lista accepts only 10-digit PL NIP).
 *
 * Length: min 5 (avoids accidental noise like "1" or "ab"), max 20 (covers
 * the longest realistic tax ID with separators stripped — Italian Codice
 * Fiscale individuale is 16, plus a margin for hyphenated/variant formats).
 */
export const TaxIdSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9]{5,20}$/,
    'Tax ID must be 5–20 alphanumeric characters (no spaces, hyphens, or punctuation)',
  );
export type TaxId = z.infer<typeof TaxIdSchema>;

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

// ─── Hard-delete reason envelope (Phase 4.4) ──────────────

/**
 * Body schema for hard-delete (`DELETE /:id/hard`) endpoints across the
 * lookup admin surface (carriers / vehicles / drivers / trailers /
 * trailer-types). Hard-delete is admin-only and irreversible — the docs
 * require a free-form justification that lands in `audit_log.metadata.reason`.
 *
 * Trim + min(3) prevents whitespace-only payloads; max(500) keeps the audit
 * row's `metadata` JSON sane. The Zod pipe throws 422 on missing/short reason,
 * matching the rest of the schema-layer validation.
 */
export const DeleteWithReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type DeleteWithReasonDto = z.infer<typeof DeleteWithReasonSchema>;

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
