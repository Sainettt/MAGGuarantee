// Wave 3 — Lookups DTO contracts.
//
// Source of truth for `/api/v1/lookups/*` per docs/13-api-design.md#lookups.
// All endpoints are read-only and accessible by every authenticated user
// (no @Roles restriction) — they back the dropdowns in the UI.

import { z } from 'zod';

import { RoleSchema, UuidSchema } from './common';

/**
 * Compact `{id, login, name, lider}` used by the people-pickers. `lider` lets a
 * picker label a leader "(lider)" (docs/28); it does not change who is listed.
 */
export const LookupUserSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
  lider: z.boolean(),
});
export type LookupUserDto = z.infer<typeof LookupUserSchema>;

export const LookupUserListSchema = z.array(LookupUserSchema);
export type LookupUserListDto = z.infer<typeof LookupUserListSchema>;

// ─── Planista pickers for docs/29 ────────────────────────

/**
 * Query for `GET /lookups/planisci/transfer-targets` — the «Nowy planista»
 * picker of a transfer request (docs/29 U2): every ACTIVE planista, minus the
 * CURRENT planista of `vehicleId` when given (unknown vehicle → nobody
 * excluded; the request endpoint re-checks the target anyway). Same
 * `LookupUserDto` rows as `/lookups/planisci`.
 */
export const PlannerTransferTargetsQuerySchema = z
  .object({
    vehicleId: UuidSchema.optional(),
  })
  .strict();
export type PlannerTransferTargetsQuery = z.infer<
  typeof PlannerTransferTargetsQuerySchema
>;

// CertificateL was collapsed from enum L1/L2/L3 to a Boolean TAK/NIE flag in
// 20260515130307_vehicle_certificate_l_to_boolean. No lookup needed — UI
// renders a single TAK/NIE switch.

// ─── Carriers picker (Phase 4.4) ─────────────────────────

/**
 * Compact `{id, login, name, active}` used by the carriers autocomplete.
 *
 * `active` is included so the UI can render greyed-out / "(nieaktywny)"
 * labels in pickers without an extra round-trip. The list excludes
 * soft-deleted carriers entirely — the picker is for live selection, not
 * historical audit views.
 */
export const LookupCarrierSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
  active: z.boolean(),
});
export type LookupCarrierDto = z.infer<typeof LookupCarrierSchema>;

export const LookupCarrierListSchema = z.array(LookupCarrierSchema);
export type LookupCarrierListDto = z.infer<typeof LookupCarrierListSchema>;

/**
 * Query-param schema for `GET /lookups/carriers`. The `q` filter is a free
 * substring match across `login` + `name`; the result set is capped at 100
 * rows by the service (autocomplete, no pagination).
 */
export const LookupCarrierFiltersSchema = z
  .object({
    q: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
export type LookupCarrierFilters = z.infer<typeof LookupCarrierFiltersSchema>;

// ─── Users picker (Phase 4.5) ────────────────────────────

/**
 * Compact `{id, login, name, role, active}` for the admin users autocomplete
 * used by the audit log filter (Phase 4.5). Mirrors `LookupCarrierSchema` —
 * intentionally narrower than the full `UserDto` from `./users.ts` so the
 * picker payload stays small. Soft-deleted users are excluded.
 *
 * Role-gated to `admin` at the controller level; the picker surfaces every
 * employee role (including inactive accounts so the admin can filter audit
 * rows tied to deactivated users).
 */
export const LookupUserAdminSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
  role: RoleSchema,
  /** Leader flag over `role` (docs/28). */
  lider: z.boolean(),
  active: z.boolean(),
});
export type LookupUserAdminDto = z.infer<typeof LookupUserAdminSchema>;

export const LookupUserAdminListSchema = z.array(LookupUserAdminSchema);
export type LookupUserAdminListDto = z.infer<
  typeof LookupUserAdminListSchema
>;

/**
 * Query-param schema for `GET /lookups/users`. Free substring match across
 * `login` + `name`; result set capped at 100 rows by the service.
 */
export const LookupUserAdminFiltersSchema = z
  .object({
    q: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
export type LookupUserAdminFilters = z.infer<
  typeof LookupUserAdminFiltersSchema
>;
