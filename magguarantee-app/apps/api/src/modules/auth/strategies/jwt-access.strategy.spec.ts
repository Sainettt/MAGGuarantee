// JwtAccessStrategy.validate builds `req.user` from the DATABASE row, not from
// the token: `mustChangePassword`, `teamId` and — docs/28 — the leader flag.
// `lider` is deliberately not a JWT claim (the edge gating never depends on
// it), so the only way it can reach guards, services and `/auth/me` is here.
//
// docs/25 B2: the same call also fills `permissions` — once, from that DB pair
// `(role, lider)` via `permissionsFor`. It is the only place the set is built;
// PermissionsGuard and `can()` never recompute it from the role.

import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { permissionsFor } from '@magguarantee/shared';

import type { Env } from '../../../config/env.schema';
import type { UserRow } from '../../users/users.repository';
import type { UsersService } from '../../users/users.service';
import { JwtAccessStrategy } from './jwt-access.strategy';

const NOW = new Date('2026-09-25T10:00:00.000Z');

function makeUser(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'planistalider1',
    email: 'planistalider1@magtrans.eu',
    passwordHash: 'hash',
    role: 'planista',
    name: 'Planista lider 1',
    active: true,
    liderId: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    authProvider: 'local',
    managedBy: 'local',
    googleSub: null,
    magspaceEmployeeId: null,
    directorySyncedAt: null,
    roleOverride: null,
    lider: false,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
}

function makeStrategy(row: UserRow | null): { strategy: JwtAccessStrategy; findById: jest.Mock } {
  const findById = jest.fn(async () => row);
  const users = { findById } as unknown as UsersService;
  const config = {
    get: (key: keyof Env) => (key === 'JWT_ACCESS_SECRET' ? 'a'.repeat(32) : undefined),
  } as unknown as ConfigService<Env, true>;
  return { strategy: new JwtAccessStrategy(config, users), findById };
}

describe('JwtAccessStrategy.validate', () => {
  it('puts the leader flag from the database on the AuthUser', async () => {
    const { strategy, findById } = makeStrategy(makeUser({ lider: true }));

    const user = await strategy.validate({ sub: 'u-1', role: 'planista' });

    expect(findById).toHaveBeenCalledWith('u-1');
    expect(user).toMatchObject({ sub: 'u-1', role: 'planista', lider: true });
  });

  it('always sets it — false for a non-leader, never undefined', async () => {
    const { strategy } = makeStrategy(makeUser({ lider: false }));

    const user = await strategy.validate({ sub: 'u-1', role: 'planista' });

    expect(user.lider).toBe(false);
  });

  it('reads the flag like teamId — same source, same request', async () => {
    const { strategy } = makeStrategy(
      makeUser({ role: 'dyspozytor', lider: true, teamId: 'team-1' }),
    );

    const user = await strategy.validate({ sub: 'u-1', role: 'dyspozytor' });

    expect(user).toMatchObject({ role: 'dyspozytor', teamId: 'team-1', lider: true });
  });

  it('a demotion bites on the next request — the token carries no flag to go stale', async () => {
    // The token below was minted while the user was a leader; nothing in it
    // says so, and the row now says otherwise.
    const { strategy } = makeStrategy(makeUser({ lider: false }));

    const user = await strategy.validate({ sub: 'u-1', role: 'planista', iat: 1 });

    expect(user.lider).toBe(false);
  });

  it('still refuses an inactive account (unchanged)', async () => {
    const { strategy } = makeStrategy(makeUser({ active: false, lider: true }));

    await expect(strategy.validate({ sub: 'u-1', role: 'planista' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('permissions (docs/25 B2)', () => {
    it('a lider planista holds vehicles.planner_transfer.decide', async () => {
      const { strategy } = makeStrategy(makeUser({ role: 'planista', lider: true }));

      const user = await strategy.validate({ sub: 'u-1', role: 'planista' });

      expect(user.permissions.has('vehicles.planner_transfer.decide')).toBe(true);
      expect([...user.permissions]).toEqual(permissionsFor('planista', true));
    });

    it('a plain planista does not — the flag is what grants it', async () => {
      const { strategy } = makeStrategy(makeUser({ role: 'planista', lider: false }));

      const user = await strategy.validate({ sub: 'u-1', role: 'planista' });

      expect(user.permissions.has('vehicles.planner_transfer.decide')).toBe(false);
      // Everything else a planista may do is still there.
      expect(user.permissions.has('vehicles.planner_transfer.request')).toBe(true);
      expect([...user.permissions]).toEqual(permissionsFor('planista', false));
    });

    it('follows the DB role, not the role claim of the token', async () => {
      // Role changed by an admin after the token was minted.
      const { strategy } = makeStrategy(makeUser({ role: 'admin', lider: false }));

      const user = await strategy.validate({ sub: 'u-1', role: 'planista' });

      expect(user.role).toBe('admin');
      expect([...user.permissions]).toEqual(permissionsFor('admin', false));
    });

    it('a demotion from lider drops the leader permission on the next request', async () => {
      const { strategy } = makeStrategy(makeUser({ role: 'planista', lider: false }));

      const user = await strategy.validate({ sub: 'u-1', role: 'planista', iat: 1 });

      expect(user.permissions.has('vehicles.planner_transfer.decide')).toBe(false);
    });
  });
});
