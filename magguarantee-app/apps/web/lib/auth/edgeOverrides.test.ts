// docs/25 §3 B6 «Edge» — tripwire. The edge middleware knows the JWT role only
// (`isAllowedForRole`: role catalog, lider = false, NO per-user overrides —
// R3). A right granted on top of a role (`GRANTABLE_EXTRA`) therefore must
// never be what opens a `PATH_PERMISSIONS` prefix for that role: the edge
// would bounce exactly the people the right was granted to, before the page's
// `requirePermission` (which does see the overrides) runs.
//
// If this test goes red, a new `GRANTABLE_EXTRA` entry (or a new edge rule)
// reaches an edge-gated area — reopen the docs/25 edge decision (overrides in
// the JWT, or drop the edge rule and gate on the page) instead of silencing it.
//
// Revocations are the other direction and need no tripwire: the edge lets a
// revoked employee through (it counts the role), the page's
// `requirePermission` / `useCan` and the api's 403 stop him.

import { describe, expect, it } from 'vitest';
import { RoleSchema, type Role } from '@magguarantee/shared';

import { PATH_PERMISSIONS, ROLE_ALLOWED_PREFIXES, isAllowedForRole } from '../roles';

import { GRANTABLE_EXTRA, hasAnyPermission, type Permission } from './permissions';

const ALL_ROLES: readonly Role[] = RoleSchema.options;

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

interface Violation {
  role: Role;
  permission: Permission;
  prefix: string;
}

/**
 * Every (role, granted right, edge prefix) where the prefix lies inside the
 * role's own area, the role fails the rule on its base permissions, and the
 * granted right would satisfy it — i.e. the edge would refuse a holder.
 */
function edgeConflicts(
  grantable: Readonly<Partial<Record<Role, readonly Permission[]>>>,
): Violation[] {
  const found: Violation[] = [];
  for (const role of ALL_ROLES) {
    for (const permission of grantable[role] ?? []) {
      for (const [prefix, rule] of Object.entries(PATH_PERMISSIONS)) {
        const inRoleArea = ROLE_ALLOWED_PREFIXES[role].some((root) => under(prefix, root));
        if (!inRoleArea) continue;
        if (hasAnyPermission(role, rule, false)) continue;
        if (rule.includes(permission)) found.push({ role, permission, prefix });
      }
    }
  }
  return found;
}

describe('edge × per-user grants (docs/25 B6 tripwire)', () => {
  it('no GRANTABLE_EXTRA right opens an edge-gated prefix its role is refused on', () => {
    expect(edgeConflicts(GRANTABLE_EXTRA)).toEqual([]);
  });

  it('the tripwire fires on a conflicting grant (self-check)', () => {
    expect(edgeConflicts({ pracownik: ['users.manage'] })).toEqual([
      { role: 'pracownik', permission: 'users.manage', prefix: '/employee/users' },
    ]);
    // Outside the role's own area the edge never lets him in anyway — no conflict.
    expect(edgeConflicts({ przewoznik: ['users.manage'] })).toEqual([]);
  });

  it('/carrier/dokumenty is gated on the page, not at the edge', () => {
    expect(Object.keys(PATH_PERMISSIONS).some((p) => under('/carrier/dokumenty', p))).toBe(false);
    expect(isAllowedForRole('/carrier/dokumenty', 'przewoznik')).toBe(true);
    expect(isAllowedForRole('/carrier/dokumenty', 'admin')).toBe(true);
    expect(isAllowedForRole('/carrier/dokumenty', 'opiekun')).toBe(false);
  });
});
