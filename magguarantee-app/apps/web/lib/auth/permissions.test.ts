// docs/25 §3 B4 — the web helpers around the permissions catalog:
//   * `effectivePermissionsOf` trusts `/auth/me` and falls back to the role
//     catalog only when an older api omits the field (rolling deploy);
//   * `canAny` is any-of and fails closed;
//   * `ADMIN_SECTION_PERMISSIONS` admits exactly who the `(admin)` segment
//     admitted before (role `admin`).

import { describe, expect, it } from 'vitest';
import { RoleSchema, type Role, type UserDto } from '@magguarantee/shared';

import {
  ADMIN_SECTION_PERMISSIONS,
  PERMISSIONS,
  canAny,
  effectivePermissionsOf,
  permissionsFor,
  type Permission,
} from './permissions';

const ALL_ROLES: readonly Role[] = RoleSchema.options;

function user(patch: Partial<UserDto>): UserDto {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    login: 'u',
    email: 'u@magtrans.eu',
    name: 'U',
    role: 'pracownik',
    mustChangePassword: false,
    lider: false,
    permissions: [],
    ...patch,
  };
}

/** What an api from before docs/25 B4 sends: a UserDto without `permissions`. */
function legacyUser(role: Role, lider: boolean): Omit<UserDto, 'permissions'> {
  const { permissions: _omit, ...rest } = user({ role, lider });
  void _omit;
  return rest;
}

describe('effectivePermissionsOf', () => {
  it('returns `/auth/me` permissions as sent — the api is authoritative', () => {
    const sent: Permission[] = ['claims.read', 'audit.read'];
    // Deliberately NOT what the role catalog says: B6 overrides must win.
    expect(effectivePermissionsOf(user({ role: 'pracownik', permissions: sent }))).toBe(
      sent,
    );
  });

  it('an empty list from the api stays empty (no silent re-derivation)', () => {
    expect(effectivePermissionsOf(user({ role: 'admin', permissions: [] }))).toEqual([]);
  });

  describe.each(ALL_ROLES)('fallback when the field is missing — %s', (role) => {
    it.each([false, true])('lider: %s → permissionsFor(role, lider)', (lider) => {
      expect(effectivePermissionsOf(legacyUser(role, lider))).toEqual(
        permissionsFor(role, lider),
      );
    });
  });

  it('a non-array `permissions` (malformed / null) also falls back', () => {
    const malformed = {
      ...legacyUser('planista', true),
      permissions: null,
    };
    expect(effectivePermissionsOf(malformed)).toEqual(permissionsFor('planista', true));
    expect(effectivePermissionsOf(malformed)).toContain('vehicles.planner_transfer.decide');
  });

  it('a missing `lider` counts as false', () => {
    expect(effectivePermissionsOf({ role: 'planista' })).toEqual(
      permissionsFor('planista', false),
    );
  });
});

describe('canAny', () => {
  it('single permission', () => {
    expect(canAny(['claims.read'], 'claims.read')).toBe(true);
    expect(canAny(['claims.read'], 'claims.verify')).toBe(false);
  });

  it('any-of list', () => {
    const rule: Permission[] = [
      'vehicles.planner_transfer.request',
      'vehicles.planner_transfer.decide',
    ];
    expect(canAny(['vehicles.planner_transfer.decide'], rule)).toBe(true);
    expect(canAny(['vehicles.read'], rule)).toBe(false);
  });

  it('fails closed: no list, empty list, empty rule', () => {
    expect(canAny(undefined, 'claims.read')).toBe(false);
    expect(canAny(null, 'claims.read')).toBe(false);
    expect(canAny([], 'claims.read')).toBe(false);
    expect(canAny([...PERMISSIONS], [])).toBe(false);
  });
});

describe('ADMIN_SECTION_PERMISSIONS', () => {
  it.each(ALL_ROLES)('%s — admitted iff admin (leader or not)', (role) => {
    for (const lider of [false, true]) {
      expect(canAny(permissionsFor(role, lider), ADMIN_SECTION_PERMISSIONS)).toBe(
        role === 'admin',
      );
    }
  });
});
