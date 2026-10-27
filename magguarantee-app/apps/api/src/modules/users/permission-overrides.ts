// Per-user permission overrides on the write side (docs/25 §3 B6).
//
// Two jobs, one module, so the four places that change a user's `(role,
// lider)` cannot drift apart:
//   - `assertOverridesFit` — the 422s of an admin write (`PATCH /users/:id`),
//     judged on the MERGED row;
//   - `overridePruneFor` — what a `(role, lider)` change must drop from the
//     STORED lists, in the same UPDATE. Called by `UsersService.update`,
//     `DirectoryService._syncExisting` (sign-in), `DirectoryService.grantAccess`
//     and `DirectoryReconcileService.run`. The directory paths never SET the
//     lists from MAGSpace data and never seed them — they only prune, and
//     record it with `pruneAuditEntry` (decision Q3). An admin edit is recorded
//     by its own `updateUser` before/after (`UserDtoFull` carries both lists).
//
// The read side — what the lists grant — is `common/authz/effective-permissions.ts`.

import { UnprocessableEntityException } from '@nestjs/common';

import {
  USER_ADMIN_CANNOT_BE_DENIED,
  USER_ADMIN_CANNOT_BE_DENIED_MESSAGE,
  USER_PERMISSION_NOT_GRANTABLE,
  USER_PERMISSION_NOT_GRANTABLE_MESSAGE,
  USER_PERMISSION_NOT_REVOCABLE,
  USER_PERMISSION_NOT_REVOCABLE_MESSAGE,
  grantableExtraFor,
  permissionsFor,
  pruneOverrides,
  type Permission,
  type Role,
} from '@magguarantee/shared';

import type { AuditEntryInput } from '../audit/audit.types';
import type { UserRow } from './users.repository';

/** Audit action of a directory-side prune (actor `system`). */
export const PRUNE_USER_PERMISSIONS_AUDIT_ACTION = 'system.pruneUserPermissions';

/** Which directory path pruned — `metadata.trigger` of the audit row. */
export type OverridePruneTrigger = 'signIn' | 'grantAccess' | 'reconcile';

/** The columns a prune rewrites, ready to spread into `UsersRepository.update`. */
export interface OverridePrune {
  data: { extraPermissions: Permission[]; deniedPermissions: Permission[] };
  /** Distinct stored entries dropped (unknown strings included). */
  removed: { extra: string[]; denied: string[] };
}

/** The part of a user row a prune reads. */
export type OverrideRow = Pick<
  UserRow,
  'login' | 'role' | 'lider' | 'extraPermissions' | 'deniedPermissions'
>;

/** The `(role, lider)` a write leaves in the row. */
export interface AccessPair {
  role: Role;
  lider: boolean;
}

/**
 * The prune a write moving `user` to `next` must carry in the SAME UPDATE, or
 * `null` when there is nothing to write: `(role, lider)` does not change, or
 * every stored entry still fits. Uses `pruneOverrides` (shared), which never
 * changes what a non-admin row grants — it only removes entries that would be
 * inert under the new pair (and every denial on `admin`, decision Q4).
 */
export function overridePruneFor(user: OverrideRow, next: AccessPair): OverridePrune | null {
  if (user.role === next.role && user.lider === next.lider) return null;
  const pruned = pruneOverrides(next.role, next.lider, user.extraPermissions, user.deniedPermissions);
  if (pruned.removed.extra.length === 0 && pruned.removed.denied.length === 0) return null;
  return {
    data: { extraPermissions: pruned.extra, deniedPermissions: pruned.denied },
    removed: pruned.removed,
  };
}

/**
 * The `system.pruneUserPermissions` row of a directory-side prune: `before` /
 * `after` carry the pair and both lists, `metadata` what was removed and why.
 */
export function pruneAuditEntry(
  user: OverrideRow,
  next: AccessPair,
  prune: OverridePrune,
  trigger: OverridePruneTrigger,
): AuditEntryInput {
  return {
    action: PRUNE_USER_PERMISSIONS_AUDIT_ACTION,
    targetType: 'User',
    targetKey: user.login,
    before: {
      role: user.role,
      lider: user.lider,
      extraPermissions: user.extraPermissions,
      deniedPermissions: user.deniedPermissions,
    },
    after: { role: next.role, lider: next.lider, ...prune.data },
    metadata: { trigger, removed: prune.removed },
    actor: 'system',
  };
}

/**
 * The 422s of an admin write, on the MERGED row (final `role`, `lider`). Only
 * the lists present in the body are judged (`undefined` = not sent):
 *  - an extra outside `GRANTABLE_EXTRA[role]` → `USER_PERMISSION_NOT_GRANTABLE`;
 *  - any denial on role `admin` → `USER_ADMIN_CANNOT_BE_DENIED` (decision Q4);
 *  - a denial outside `permissionsFor(role, lider)` → `USER_PERMISSION_NOT_REVOCABLE`.
 * `extensions` = `{ code, permissions }`, `permissions` = the offending ids in
 * the order they were sent (for the admin denial: everything sent).
 */
export function assertOverridesFit(
  next: AccessPair,
  input: { extra?: readonly Permission[]; denied?: readonly Permission[] },
): void {
  if (input.extra !== undefined) {
    const grantable = new Set<Permission>(grantableExtraFor(next.role));
    const refused = input.extra.filter((p) => !grantable.has(p));
    if (refused.length > 0) {
      throw refusal(USER_PERMISSION_NOT_GRANTABLE, USER_PERMISSION_NOT_GRANTABLE_MESSAGE, refused);
    }
  }
  if (input.denied === undefined || input.denied.length === 0) return;
  if (next.role === 'admin') {
    throw refusal(USER_ADMIN_CANNOT_BE_DENIED, USER_ADMIN_CANNOT_BE_DENIED_MESSAGE, input.denied);
  }
  const base = new Set<Permission>(permissionsFor(next.role, next.lider));
  const refused = input.denied.filter((p) => !base.has(p));
  if (refused.length > 0) {
    throw refusal(USER_PERMISSION_NOT_REVOCABLE, USER_PERMISSION_NOT_REVOCABLE_MESSAGE, refused);
  }
}

function refusal(
  code: string,
  message: string,
  permissions: readonly Permission[],
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message,
    extensions: { code, permissions: [...permissions] },
  });
}
