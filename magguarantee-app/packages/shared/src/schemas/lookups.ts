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

/** Static enum echo per docs/13-api-design.md (CertificateL: L1/L2/L3). */
export const CertTypeListSchema = z.array(z.enum(['L1', 'L2', 'L3']));
export type CertTypeListDto = z.infer<typeof CertTypeListSchema>;
