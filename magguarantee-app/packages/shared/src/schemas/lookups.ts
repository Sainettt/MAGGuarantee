// Wave 3 — Lookups DTO contracts.
//
// Source of truth for `/api/v1/lookups/*` per docs/13-api-design.md#lookups.
// All endpoints are read-only and accessible by every authenticated user
// (no @Roles restriction) — they back the dropdowns in the UI.

import { z } from 'zod';

import { UuidSchema } from './common';

/** Compact `{id, login, name}` used by the people-pickers. */
export const LookupUserSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
});
export type LookupUserDto = z.infer<typeof LookupUserSchema>;

export const LookupUserListSchema = z.array(LookupUserSchema);
export type LookupUserListDto = z.infer<typeof LookupUserListSchema>;

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
