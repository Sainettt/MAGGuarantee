// `can` / `canAny` / `grantedPermissions` (docs/25 §3 B2.0). They read only
// `AuthUser.permissions`; a user object without the set holds nothing (fail
// closed, same rule as PermissionsGuard), and the role is never consulted.

import { makeAuthUser } from '../testing/make-auth-user';
import { can, canAny, grantedPermissions, type PermissionHolder } from './can';

describe('can', () => {
  it('true when the set holds the permission', () => {
    expect(can(makeAuthUser('pracownik'), 'claims.verify')).toBe(true);
  });

  it('false when it does not', () => {
    expect(can(makeAuthUser('przewoznik'), 'claims.verify')).toBe(false);
  });

  it('follows the leader flag through the set', () => {
    expect(can(makeAuthUser('planista'), 'vehicles.planner_transfer.decide')).toBe(false);
    expect(can(makeAuthUser('planista', { lider: true }), 'vehicles.planner_transfer.decide')).toBe(
      true,
    );
  });

  it('reads the set, not the role (B6 overrides land in the set)', () => {
    const granted = makeAuthUser('przewoznik', { permissions: new Set(['users.manage'] as const) });
    const revoked = makeAuthUser('admin', { permissions: new Set() });
    expect(can(granted, 'users.manage')).toBe(true);
    expect(can(revoked, 'users.manage')).toBe(false);
  });

  it('fails closed on a holder without a real Set', () => {
    const noSet = {} as unknown as PermissionHolder;
    const arrayInstead = { permissions: ['users.manage'] } as unknown as PermissionHolder;
    expect(can(noSet, 'users.manage')).toBe(false);
    expect(can(arrayInstead, 'users.manage')).toBe(false);
  });
});

describe('canAny', () => {
  it('any-of: one match is enough', () => {
    expect(canAny(makeAuthUser('przewoznik'), ['claims.verify', 'claims.submit'])).toBe(true);
  });

  it('false when none match', () => {
    expect(canAny(makeAuthUser('dyspozytor'), ['claims.verify', 'claims.submit'])).toBe(false);
  });

  it('an empty list grants nothing, even to admin', () => {
    expect(canAny(makeAuthUser('admin'), [])).toBe(false);
  });

  it('fails closed on a holder without the set', () => {
    expect(canAny({} as unknown as PermissionHolder, ['users.manage'])).toBe(false);
  });
});

describe('grantedPermissions', () => {
  it('returns the very set of the user', () => {
    const user = makeAuthUser('eksport');
    expect(grantedPermissions(user)).toBe(user.permissions);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'admin'],
    ['a refresh-token payload', { sub: 'u-1', jti: 'j-1', rawToken: 'r' }],
    ['an array of permissions', { permissions: ['users.manage'] }],
  ])('null for %s', (_label, value) => {
    expect(grantedPermissions(value)).toBeNull();
  });
});
