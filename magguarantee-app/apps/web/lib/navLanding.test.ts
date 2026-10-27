// `/employee` root target (`employeeLandingPath`) — the same destinations as
// the former role switch for every role set, and no redirect loop when a
// per-user revocation (docs/25 B6) removes the right of that destination.

import { describe, expect, it } from 'vitest';
import type { Role } from '@magguarantee/shared';

import { effectivePermissionsFor, permissionsFor, type Permission } from './auth/permissions';
import { EMPLOYEE_NAV, EMPLOYEE_SHELL_ROLES, employeeLandingPath } from './nav.config';

/** The pre-B6 `/employee/page.tsx`: `role === 'opiekun' ? opieka : dashboard`. */
const LEGACY: Partial<Record<Role, string>> = {
  admin: '/employee/dashboard',
  pracownik: '/employee/dashboard',
  opiekun: '/employee/opieka',
};

describe('employeeLandingPath', () => {
  it.each(EMPLOYEE_SHELL_ROLES)('%s — unchanged without overrides (lider on and off)', (role) => {
    const legacy = LEGACY[role];
    expect(legacy).toBeDefined();
    expect(employeeLandingPath(permissionsFor(role, false), role)).toBe(legacy);
    expect(employeeLandingPath(permissionsFor(role, true), role)).toBe(legacy);
  });

  it('pracownik without dashboard.read → Wnioski (no /employee ↔ /employee/dashboard loop)', () => {
    const permissions = effectivePermissionsFor('pracownik', false, [], ['dashboard.read']);
    expect(employeeLandingPath(permissions, 'pracownik')).toBe('/employee/claims');
  });

  it('opiekun without panel.opiekun → his next visible entry', () => {
    const permissions = effectivePermissionsFor('opiekun', false, [], ['panel.opiekun']);
    expect(employeeLandingPath(permissions, 'opiekun')).toBe('/employee/moje-pojazdy');
  });

  it('nothing visible left → the in-shell «Brak dostępu» page', () => {
    const permissions = effectivePermissionsFor(
      'pracownik',
      false,
      [],
      ['dashboard.read', 'claims.read'],
    );
    expect(employeeLandingPath(permissions, 'pracownik')).toBe('/employee/forbidden');
    expect(employeeLandingPath([], 'opiekun')).toBe('/employee/forbidden');
  });

  it('never targets an entry whose right the user lacks — any single revocation, every shell role', () => {
    for (const role of EMPLOYEE_SHELL_ROLES) {
      if (role === 'admin') continue; // admin can never be denied (decision Q4)
      for (const revoked of permissionsFor(role, true)) {
        const permissions: readonly Permission[] = effectivePermissionsFor(role, true, [], [revoked]);
        const target = employeeLandingPath(permissions, role);
        const entry = EMPLOYEE_NAV.find((link) => link.href === target);
        if (entry) {
          const rule: readonly Permission[] =
            typeof entry.permission === 'string' ? [entry.permission] : entry.permission;
          expect(rule.some((p) => permissions.includes(p)), `${role} −${revoked}`).toBe(true);
        } else {
          expect(target, `${role} −${revoked}`).toBe('/employee/forbidden');
        }
      }
    }
  });
});
