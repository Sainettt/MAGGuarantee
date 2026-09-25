// The service half of `lider ⇒ role ∈ LIDER_ROLES` (docs/28 §1).
//
// The Zod refine (`refineLiderPair`) only sees one request body; the services
// see the row the write will actually produce — a partial PATCH merged onto the
// stored user, a `roleOverride` the next sync will copy into `role`, a mapping
// PUT that keeps its stored flag. This is the check for those, and the reason
// the database CHECKs `user_lider_requires_lider_role` /
// `stanowisko_role_mapping_lider_requires_lider_role` never have to fire (a
// CHECK violation surfaces as a 500, or as an aborted reconcile).

import { UnprocessableEntityException } from '@nestjs/common';

import {
  LIDER_REQUIRES_LIDER_ROLE_MESSAGE,
  USER_LIDER_REQUIRES_LIDER_ROLE,
  isLiderRole,
  type Role,
} from '@magguarantee/shared';

/**
 * Which column the refused pair is about. `roleOverride` means the pair would
 * only break on the NEXT directory sync (which writes the override into
 * `role`) — docs/28 §7 R2.
 */
export type LiderPairField = 'role' | 'roleOverride';

/**
 * Throws 422 `USER_LIDER_REQUIRES_LIDER_ROLE` when `lider` is set on a role
 * outside `LIDER_ROLES`. `extensions.field` names the column the pair was
 * checked against; the web must not depend on it (the Zod-level 422 carries
 * only `code`).
 */
export function assertLiderPair(
  role: Role,
  lider: boolean,
  field: LiderPairField = 'role',
): void {
  if (!lider || isLiderRole(role)) return;
  throw new UnprocessableEntityException({
    message: LIDER_REQUIRES_LIDER_ROLE_MESSAGE,
    extensions: { code: USER_LIDER_REQUIRES_LIDER_ROLE, field },
  });
}
