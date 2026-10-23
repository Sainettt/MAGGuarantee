// docs/25 §3 B4 — the employee nav moved from `roles` to `permission` (+ a
// `roles` scope qualifier on the two «Wyjazdy» entries). GOLDEN is the output
// of the pre-B4 `filterNavForRole(role)`, captured from that code and frozen
// here: for every role and leader variant, with the permissions `/auth/me`
// sends today (`permissionsFor(role, lider)`), the visible keys and their
// order must not change.

import { describe, expect, it } from 'vitest';
import { RoleSchema, type Role } from '@magguarantee/shared';

import { effectivePermissionsOf, permissionsFor } from './auth/permissions';
import { EMPLOYEE_NAV, EMPLOYEE_SHELL_ROLES, filterNav } from './nav.config';

const GOLDEN: Readonly<Record<Role, readonly string[]>> = {
  admin: [
    'dashboard',
    'claims',
    'opieka',
    'alerts',
    'moje-pojazdy',
    'carriers',
    'vehicles',
    'transfers',
    'drivers',
    'trailers',
    'trailer-types',
    'teams',
    'delegations',
    'limits',
    'users',
    'sso',
    'audit',
    'diagnostics',
  ],
  pracownik: ['dashboard', 'claims'],
  opiekun: [
    'opieka',
    'alerts',
    'moje-pojazdy',
    'opieka-delegations',
    'carriers',
    'vehicles',
    'transfers',
    'drivers',
    'trailers',
  ],
  planista: [],
  dyspozytor: [],
  przewoznik: [],
  eksport: [],
  weryfikator: [],
};

const ALL_ROLES: readonly Role[] = RoleSchema.options;

const keys = (role: Role, lider: boolean): string[] =>
  filterNav(permissionsFor(role, lider), role).map((l) => l.key);

describe('filterNav — golden per role (pre-B4 output)', () => {
  it('covers all 8 roles', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...ALL_ROLES].sort());
  });

  describe.each(ALL_ROLES)('%s', (role) => {
    it.each([false, true])('lider: %s', (lider) => {
      expect(keys(role, lider)).toEqual(GOLDEN[role]);
    });

    it('an api without `permissions` (rolling deploy) yields the same nav', () => {
      for (const lider of [false, true]) {
        const legacyUser = { role, lider };
        expect(
          filterNav(effectivePermissionsOf(legacyUser), role).map((l) => l.key),
        ).toEqual(GOLDEN[role]);
      }
    });
  });
});

describe('nav config invariants', () => {
  it('keys are unique', () => {
    const all = EMPLOYEE_NAV.map((l) => l.key);
    expect(new Set(all).size).toBe(all.length);
  });

  it('only the two «Wyjazdy» entries carry a role scope qualifier', () => {
    expect(
      EMPLOYEE_NAV.filter((l) => l.roles !== undefined).map((l) => [l.key, l.roles]),
    ).toEqual([
      ['opieka-delegations', ['opiekun']],
      ['delegations', ['admin']],
    ]);
  });

  it('the shell scope is exactly the roles with a non-empty nav', () => {
    expect([...EMPLOYEE_SHELL_ROLES].sort()).toEqual(
      ALL_ROLES.filter((r) => GOLDEN[r].length > 0).sort(),
    );
  });

  it('a permission is enough on its own — no hidden role check besides the scope', () => {
    // Every permission-only entry shows for an employee-shell role holding just
    // that permission (what B6 overrides will rely on).
    for (const link of EMPLOYEE_NAV.filter((l) => l.roles === undefined)) {
      const rule = typeof link.permission === 'string' ? [link.permission] : link.permission;
      expect(filterNav([rule[0]!], 'pracownik').map((l) => l.key)).toContain(link.key);
    }
  });
});
