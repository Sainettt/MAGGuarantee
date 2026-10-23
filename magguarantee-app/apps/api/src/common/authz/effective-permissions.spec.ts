// `effectivePermissions` / `toPermissionList` (docs/25 §3 B4). Today the set is
// exactly `permissionsFor(role, lider)` — the strategy (`AuthUser.permissions`)
// and the wire (`UserDto.permissions`) both go through here, so this spec pins
// that equivalence for every role and both flag values. B6 changes it on
// purpose, here and nowhere else.

import { PERMISSIONS, permissionsFor, Role, type Permission } from '@magguarantee/shared';

import { effectivePermissions, toPermissionList } from './effective-permissions';

const ROLES = Role.options;

describe('effectivePermissions', () => {
  it.each(ROLES.flatMap((role) => [[role, false] as const, [role, true] as const]))(
    '%s (lider=%s) = permissionsFor(role, lider)',
    (role, lider) => {
      expect([...effectivePermissions({ role, lider })]).toEqual(permissionsFor(role, lider));
    },
  );

  it('the leader flag is what grants vehicles.planner_transfer.decide to a planista', () => {
    const decide: Permission = 'vehicles.planner_transfer.decide';
    expect(effectivePermissions({ role: 'planista', lider: false }).has(decide)).toBe(false);
    expect(effectivePermissions({ role: 'planista', lider: true }).has(decide)).toBe(true);
  });

  it('returns a fresh set per call — one request cannot leak into another', () => {
    const a = effectivePermissions({ role: 'admin', lider: false });
    const b = effectivePermissions({ role: 'admin', lider: false });
    expect(a).not.toBe(b);
    expect([...a]).toEqual([...b]);
  });

  it('fails closed on a string that is not a role', () => {
    const forged = { role: 'superadmin' as unknown as Role, lider: true };
    expect(effectivePermissions(forged).size).toBe(0);
  });
});

describe('toPermissionList', () => {
  it('lists the set in catalog order, whatever order it was built in', () => {
    const shuffled = new Set<Permission>(['users.manage', 'claims.read', 'audit.read']);
    expect(toPermissionList(shuffled)).toEqual(['claims.read', 'users.manage', 'audit.read']);
  });

  it('the full catalog round-trips to PERMISSIONS', () => {
    expect(toPermissionList(new Set(PERMISSIONS))).toEqual([...PERMISSIONS]);
  });

  it('an empty set lists nothing', () => {
    expect(toPermissionList(new Set())).toEqual([]);
  });

  it('never emits a value outside the catalog', () => {
    const polluted = new Set(['claims.read', 'not.a.permission']);
    expect(toPermissionList(polluted as ReadonlySet<string> as ReadonlySet<Permission>)).toEqual([
      'claims.read',
    ]);
  });

  it('returns a fresh array — mutating it cannot corrupt the permissionsFor cache', () => {
    const cached = [...permissionsFor('planista', true)];
    const list = toPermissionList(effectivePermissions({ role: 'planista', lider: true }));
    list.length = 0;
    expect(permissionsFor('planista', true)).toEqual(cached);
  });

  it.each(ROLES)('round-trips effectivePermissions for %s with the catalog order', (role) => {
    for (const lider of [false, true]) {
      const listed = toPermissionList(effectivePermissions({ role, lider }));
      expect(listed).toEqual(permissionsFor(role, lider));
    }
  });
});
