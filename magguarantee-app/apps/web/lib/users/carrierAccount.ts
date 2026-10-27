// A carrier account in the admin user form (docs/14 A.8, docs/13 PATCH
// /users/:id — decision Q5, 2026-10-27). Its role is bound to the Carrier row:
// the form shows the access fields read-only and the PATCH never carries them.
// The api answers any `role` in the body of a przewoznik row with 422
// `USER_CARRIER_ROLE_LOCKED` — the form used to send `role: 'pracownik'` and
// silently turn carriers into employees.

import type { Role } from '@magguarantee/shared';

/** The PATCH fields a carrier row never sends. */
export const CARRIER_LOCKED_FIELDS = [
  'role',
  'lider',
  'liderId',
  'managedBy',
  'roleOverride',
] as const;

export type CarrierLockedField = (typeof CARRIER_LOCKED_FIELDS)[number];

/** True for the stored row of a carrier (`role = przewoznik`). */
export function isCarrierAccount(user: { role: Role } | null | undefined): boolean {
  return user?.role === 'przewoznik';
}

/** `body` without the access fields a carrier row may not send. */
export function omitCarrierLockedFields<T extends Record<string, unknown>>(
  body: T,
): Omit<T, CarrierLockedField> {
  const copy: Record<string, unknown> = { ...body };
  for (const field of CARRIER_LOCKED_FIELDS) delete copy[field];
  return copy as Omit<T, CarrierLockedField>;
}
