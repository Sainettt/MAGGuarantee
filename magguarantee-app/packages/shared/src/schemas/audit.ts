// Phase 4.5 — Audit read-side DTO contracts.
//
// Source of truth for `GET /api/v1/audit` per
// docs/13-api-design.md#audit-апи-v1audit-admin. The write-side
// (`AuditWriter`, `AuditInterceptor`) is a backend-internal concern and is
// NOT exposed here.
//
// Admin-only — see `@Roles('admin')` on the controller.

import { z } from 'zod';

import { IsoDateTimeSchema, RoleSchema, UuidSchema } from './common';

/**
 * Row shape returned by the audit list. Mirrors the `AuditLog` Prisma model
 * plus a resolved `user` join (login + name) so the admin panel can render
 * "<login> (<name>)" without a second round-trip.
 *
 * `before` / `after` / `metadata` are persisted as JSONB — we surface them as
 * `z.unknown()` on the wire because each `action` has its own payload shape
 * and the frontend handles per-action rendering itself.
 */
export const AuditLogDtoSchema = z.object({
  id: UuidSchema,
  action: z.string(),
  targetType: z.string().nullable(),
  targetKey: z.string().nullable(),
  userId: UuidSchema.nullable(),
  userLogin: z.string().nullable(),
  userName: z.string().nullable(),
  userRole: RoleSchema.nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  metadata: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type AuditLogDto = z.infer<typeof AuditLogDtoSchema>;

/** Cursor-paginated envelope: opaque base64 cursor over `(createdAt, id)`. */
export const AuditLogListSchema = z.object({
  items: z.array(AuditLogDtoSchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogListDto = z.infer<typeof AuditLogListSchema>;

/**
 * Every `targetType` value the write-side actually persists — i.e. the set of
 * `@Audit({ targetType })` literals across the API controllers/services.
 *
 * The values are **PascalCase Prisma model names** (`Claim`, not `claim`) and
 * the `targetType` filter matches them with case-sensitive equality, so any UI
 * that offers a target-type picker MUST source its options here rather than
 * hand-rolling a list — a casing drift silently yields zero rows.
 *
 * When a new `@Audit({ targetType: 'X' })` is introduced, add `'X'` here.
 */
export const AUDIT_TARGET_TYPES = [
  'Claim',
  'Delegation',
  'Carrier',
  'CarrierAttachment',
  'User',
  'Team',
  'Vehicle',
  'VehicleAttachment',
  'Trailer',
  'TrailerAttachment',
  'TrailerType',
  'Driver',
  'DriverAttachment',
  'MonthlyLimit',
  'MailJob',
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/**
 * Query-string schema for `GET /audit`. All filters are optional; the route
 * accepts any subset and combines them with AND. `limit` defaults to 50 with
 * a hard cap of 200 — the admin UI paginates beyond that.
 *
 * Matching semantics (implemented in `AuditQueryRepository`):
 *  - `targetType` / `targetKey` / `userId` — exact, case-sensitive equality.
 *    Pick `targetType` from `AUDIT_TARGET_TYPES`.
 *  - `action` — case-insensitive **substring** match, so the admin filter bar
 *    can be a free-text search box (`claim` finds `submitClaim`,
 *    `updateClaim`, `claim.verify`, …).
 *
 * `targetType` stays a plain string rather than `z.enum(AUDIT_TARGET_TYPES)`:
 * a controller may start tagging a new entity before this list catches up, and
 * a 400 on an unknown-but-harmless filter value is worse than an empty page.
 */
export const AuditFiltersSchema = z
  .object({
    targetType: z.string().trim().min(1).max(64).optional(),
    targetKey: z.string().trim().min(1).max(128).optional(),
    userId: UuidSchema.optional(),
    /** Case-insensitive substring of `action` — not an exact action name. */
    action: z.string().trim().min(1).max(128).optional(),
    /** ISO date or datetime; service coerces to `>= startOfDay` semantics. */
    from: z.string().trim().min(1).optional(),
    /** ISO date or datetime; service coerces to `<= endOfDay` semantics. */
    to: z.string().trim().min(1).optional(),
    /** Opaque cursor — base64-encoded `(createdAt ISO, id)` tuple. */
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type AuditFilters = z.infer<typeof AuditFiltersSchema>;
