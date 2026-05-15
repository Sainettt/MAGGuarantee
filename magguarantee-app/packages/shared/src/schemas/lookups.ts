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
