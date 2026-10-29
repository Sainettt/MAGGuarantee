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

import { parseIsoWeekKey } from '../domain/iso-week';
import { PERMISSIONS } from '../permissions';

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

// ─── ADR classes (shared by Vehicle + Driver) ─────────────

/**
 * ADR top-level transport class ("1".."9"). Kept as a string enum (NOT a
 * numeric one) because the DB stores these as `String[]` — Prisma enum values
 * cannot start with a digit. Shared by `Vehicle.adrClasses` and
 * `Driver.adrClasses`; both live in different domain files so the primitive
 * belongs here (the common convention for cross-domain literals).
 */
export const AdrClassSchema = z.enum([
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
]);
export type AdrClass = z.infer<typeof AdrClassSchema>;

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

/**
 * ISO 8601 week key `YYYY-Www` (two-digit week, `2026-W05`) of a week that
 * EXISTS — `2027-W53` is rejected because 2027 has 52 weeks. The key of km
 * limits and of every claim breakdown row since 2026-10-29
 * (docs/01-overview.md §«Расчёт гарантии»). Validation is `parseIsoWeekKey`
 * from `domain/iso-week.ts`, so the schema and the helpers cannot disagree.
 */
export const IsoWeekKeySchema = z.string().refine(
  (key) => parseIsoWeekKey(key) !== null,
  {
    message:
      'isoWeek must be `YYYY-Www` with a two-digit week that exists in that ISO year (e.g. `2026-W05`).',
  },
);
export type IsoWeekKey = z.infer<typeof IsoWeekKeySchema>;

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
 *
 * A leader is NOT a role: "lider_planista" is `role: 'planista'` plus the
 * `lider` flag (see `LIDER_ROLES` below). Never add `lider_*` members here, in
 * `auth.ts#Role` or in the Prisma enum — every `@Roles`, scope branch and
 * `Record<Role, …>` would silently miss them (docs/28 §0, §7 R1). A test in
 * `tests/lider-roles.test.ts` guards this.
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

/**
 * The roles that may be handed out automatically — everything except `admin`
 * and `przewoznik`.
 *
 * `admin` is deliberately local-only: the Google SSO derives a role from the
 * employee's stanowisko, and management must not be able to grant full access
 * by editing a job title in MAGSpace (docs/24 decision #4). `przewoznik` is not
 * an employee role at all — carriers are created through `POST /carriers`.
 *
 * Mirrored by two database CHECK constraints
 * (`stanowisko_role_mapping_role_not_privileged`,
 * `user_role_override_not_privileged`), so this is the same rule spelled in
 * three places on purpose: Zod for the message, the constraint for the
 * guarantee.
 */
export const AssignableRoleSchema = RoleSchema.exclude(['admin', 'przewoznik']);
export type AssignableRoleSchema = z.infer<typeof AssignableRoleSchema>;

// ─── Leaders (docs/28) ────────────────────────────────────

/**
 * The base roles that may carry the leader flag (`User.lider`,
 * `StanowiskoRoleMapping.lider`). A leader keeps the user type, scope, panel
 * and every `@Roles` of the base role; the flag only adds permissions on top
 * (docs/28 §1).
 *
 * `admin` does not need it (it can do everything), `przewoznik` is not an
 * employee, `weryfikator` was not requested — adding one is this line plus the
 * two CHECK constraints below.
 *
 * The invariant `lider ⇒ role ∈ LIDER_ROLES` is spelled in three places, like
 * `AssignableRoleSchema`: the Zod refine ({@link refineLiderPair}, for the
 * message), the api services (partial PATCH, merged rows) and the database
 * CHECKs `user_lider_requires_lider_role` /
 * `stanowisko_role_mapping_lider_requires_lider_role` (the guarantee).
 */
export const LIDER_ROLES = [
  'planista',
  'dyspozytor',
  'opiekun',
  'pracownik',
  'eksport',
] as const;

export const LiderRoleSchema = RoleSchema.extract(LIDER_ROLES);
export type LiderRoleSchema = z.infer<typeof LiderRoleSchema>;
export type LiderRole = LiderRoleSchema;

/** True when `role` may carry the leader flag. */
export function isLiderRole(role: string): role is LiderRole {
  return (LIDER_ROLES as readonly string[]).includes(role);
}

// ─── Permissions (docs/25) ────────────────────────────────

/**
 * One catalog permission (docs/25 §2). The enum lives in the schemas, not in
 * `../permissions`: that module must stay runtime-dependency-free (the Next.js
 * edge middleware imports it; a test enforces "type imports only"). The TS
 * type is `Permission`, exported from `../permissions`.
 *
 * Defined here (re-exported from `./auth`, where it lived until B6) because
 * `./users` needs it for the per-user overrides and must not import `./auth` —
 * that would close the import cycle described at
 * {@link USER_LIDER_REQUIRES_LIDER_ROLE}.
 */
export const PermissionSchema = z.enum(PERMISSIONS);

/**
 * 422 — the pair `(role, lider)` breaks `lider ⇒ role ∈ LIDER_ROLES`. Carried
 * as `extensions.code` of the RFC 7807 envelope, whether the Zod refine caught
 * it (explicit pair in one body) or a service did (merged row: partial
 * `PATCH /users/:id`, `roleOverride`, `PUT /sso/stanowisko-roles/:code` that
 * keeps the stored flag).
 *
 * Defined here rather than in `./auth` (next to `USER_MANAGED_BY_MAGSPACE`,
 * where it is re-exported) because `./users` and `./sso` need it for the
 * refine and `./users` must not import `./auth` — that would close an import
 * cycle (`./auth` imports `PasswordSchema` from `./users`).
 */
export const USER_LIDER_REQUIRES_LIDER_ROLE = 'USER_LIDER_REQUIRES_LIDER_ROLE' as const;

/** Human fallback for {@link USER_LIDER_REQUIRES_LIDER_ROLE} — the web localises by code. */
export const LIDER_REQUIRES_LIDER_ROLE_MESSAGE =
  'Flagę lidera można nadać tylko rolom: planista, dyspozytor, opiekun, pracownik, eksport.';

/**
 * `superRefine` callback for a body that carries `role` and `lider` together:
 * `lider: true` next to a role outside {@link LIDER_ROLES} is an issue on the
 * `lider` path.
 *
 * The issue carries `params.code` = {@link USER_LIDER_REQUIRES_LIDER_ROLE}. The
 * api's `ZodValidationPipe` answers such a business-rule issue with 422 +
 * `extensions.code` instead of the plain 400, so the wire code is the same as
 * when a service catches the pair on a merged row.
 *
 * Exported as a function (not only as refined schemas) so a form can bolt it
 * onto its own variant — e.g. `CreateUserSchema.passthrough().superRefine(refineLiderPair)`.
 */
export function refineLiderPair(
  value: { role?: string | null; lider?: boolean | null },
  ctx: z.RefinementCtx,
): void {
  if (value.lider !== true || value.role == null || isLiderRole(value.role)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['lider'],
    message: LIDER_REQUIRES_LIDER_ROLE_MESSAGE,
    params: { code: USER_LIDER_REQUIRES_LIDER_ROLE },
  });
}

// ─── Query-string primitives ──────────────────────────────

/**
 * A boolean query parameter: exactly `'true'` or `'false'`, anything else is a
 * validation error.
 *
 * Deliberately NOT `z.coerce.boolean()`: that is `Boolean(value)`, so the
 * string `'false'` coerces to `true` and `?lider=false` would return only the
 * leaders.
 */
export const BooleanQueryParamSchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

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
