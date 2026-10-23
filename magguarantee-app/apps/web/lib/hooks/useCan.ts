'use client';

// `useCan` / `usePermissions` — the client side of the permissions layer
// (docs/25 §3 B4). Both read the EFFECTIVE list of the signed-in user from
// `GET /auth/me` (`effectivePermissionsOf`): the api is authoritative, the
// role is never re-mapped here.
//
// While `/auth/me` is loading (or the caller is anonymous) there is no list:
// `useCan` answers `false` and `usePermissions` an empty list — exactly what
// the role checks they replace did (`user?.role === 'admin'` with no user).

import { useAuth } from './useAuth';
import {
  canAny,
  effectivePermissionsOf,
  type Permission,
  type PermissionRule,
} from '../auth/permissions';

const NO_PERMISSIONS: readonly Permission[] = [];

/** The signed-in user's effective permissions; empty while loading / anonymous. */
export function usePermissions(): readonly Permission[] {
  const { user } = useAuth();
  return user ? effectivePermissionsOf(user) : NO_PERMISSIONS;
}

/** Any-of: true when the signed-in user holds `rule` (or one of a list). */
export function useCan(rule: PermissionRule): boolean {
  return canAny(usePermissions(), rule);
}
