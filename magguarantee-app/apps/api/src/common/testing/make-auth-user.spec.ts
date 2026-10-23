// The AuthUser test factory must derive `permissions` exactly like
// JwtAccessStrategy.validate (`permissionsFor(role, lider)`), or every spec
// built on it would test a user production can never produce.

import { permissionsFor, RoleSchema } from '@magguarantee/shared';

import type { AuthUser } from '../../modules/auth/decorators/current-user.decorator';
import { makeAuthUser, withRole } from './make-auth-user';

describe('makeAuthUser', () => {
  it.each(RoleSchema.options)('%s: permissions = permissionsFor(role, false)', (role) => {
    expect([...makeAuthUser(role).permissions]).toEqual(permissionsFor(role, false));
  });

  it('honours the leader flag', () => {
    const user = makeAuthUser('planista', { lider: true });
    expect(user.lider).toBe(true);
    expect([...user.permissions]).toEqual(permissionsFor('planista', true));
  });

  it('keeps every given field and adds only defaults that are missing', () => {
    const user = makeAuthUser('dyspozytor', { sub: 'd-1', teamId: 'team-1', name: 'Dys' });
    expect(user).toMatchObject({
      sub: 'd-1',
      login: 'dyspozytor',
      email: 'dyspozytor@magtrans.eu',
      name: 'Dys',
      role: 'dyspozytor',
      mustChangePassword: false,
      teamId: 'team-1',
    });
    // Absent unless given, like the fixtures it replaced.
    expect('lider' in makeAuthUser('admin')).toBe(false);
    expect('teamId' in makeAuthUser('admin')).toBe(false);
  });

  it('an explicit permission set wins', () => {
    const permissions = new Set(['users.manage'] as const);
    expect(makeAuthUser('przewoznik', { permissions }).permissions).toBe(permissions);
  });

  it('a stray role in an untyped overrides object cannot desync role and permissions', () => {
    const stray = { role: 'admin' } as unknown as Partial<Omit<AuthUser, 'role'>>;
    const user = makeAuthUser('przewoznik', stray);
    expect(user.role).toBe('przewoznik');
    expect(user.permissions.has('users.manage')).toBe(false);
  });

  it('builds a fresh set per user', () => {
    expect(makeAuthUser('admin').permissions).not.toBe(makeAuthUser('admin').permissions);
  });
});

describe('withRole', () => {
  const carrier = makeAuthUser('przewoznik', { sub: 'u-carrier', login: 'przewoznik1' });

  it('re-derives the permission set for the new role', () => {
    const admin = withRole(carrier, 'admin');
    expect(admin.role).toBe('admin');
    expect([...admin.permissions]).toEqual(permissionsFor('admin', false));
  });

  it('keeps the person (sub, login, lider) and applies overrides on top', () => {
    const lider = makeAuthUser('opiekun', { sub: 'op-1', lider: true });
    const planista = withRole(lider, 'planista', { sub: 'plan-1' });
    expect(planista).toMatchObject({ sub: 'plan-1', login: 'opiekun', lider: true, role: 'planista' });
    expect([...planista.permissions]).toEqual(permissionsFor('planista', true));
  });

  it('does not mutate the base user', () => {
    withRole(carrier, 'admin');
    expect(carrier.role).toBe('przewoznik');
    expect([...carrier.permissions]).toEqual(permissionsFor('przewoznik', false));
  });
});
