// Who gets the carrier «Dokumenty» tab / `/carrier/dokumenty` (docs/14
// «Carrier „Dokumenty” tab» B.1, docs/25 §3 B6) — the one predicate the server
// page and the client tab bar share.
//
// The right is per user (an admin grants `carrier_documents.read` to chosen
// carriers), so it is read from the EFFECTIVE list of `/auth/me`, never from
// the role. The edge cannot see per-user grants, which is why
// `/carrier/dokumenty` is NOT in `PATH_PERMISSIONS` (`lib/roles.ts`): the
// `/carrier` prefix is open to `przewoznik` and this check runs on the page.
//
// Scope on top of the right: the carrier panel (`panel.carrier`) AND an own
// company (`UserDto.carrierId`). Admin reaches the carrier shell and holds
// `carrier_documents.read` by role, but has no panel.carrier and no company,
// so he never gets the tab.

import type { UserDto } from '@magguarantee/shared';

import { canAny, effectivePermissionsOf, type PermissionSubject } from './permissions';

export type CarrierDocumentsSubject = PermissionSubject &
  Partial<Pick<UserDto, 'carrierId'>>;

/**
 * The `Carrier.id` whose documents this user may open on the carrier panel,
 * or `null` when the tab must not exist for him. `carrierId` is optional in
 * the input on purpose: an api that predates B6 does not send it → `null`.
 */
export function carrierDocumentsCarrierId(user: CarrierDocumentsSubject): string | null {
  if (user.role !== 'przewoznik') return null;
  if (!user.carrierId) return null;
  const permissions = effectivePermissionsOf(user);
  if (!canAny(permissions, 'panel.carrier')) return null;
  if (!canAny(permissions, 'carrier_documents.read')) return null;
  return user.carrierId;
}
