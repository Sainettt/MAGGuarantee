// GET /auth/me (docs/13 «Auth», docs/25 §3 B4). The body is the request user
// serialised: `permissions` is the set JwtAccessStrategy built for THIS request
// — the one PermissionsGuard admitted it with — listed in catalog order. It is
// never recomputed from the role here, so the web cannot see rights the guards
// would not grant (or miss ones they would).
//
// Last block (docs/25 B5): the real session-only handlers of this controller
// through the real PermissionsGuard. The guard denies by default, so these
// routes reach every role only because they carry `@AuthenticatedOnly`.

import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { permissionsFor, RoleSchema, UserDto, type Permission } from '@magguarantee/shared';

import { toPermissionList } from '../../common/authz/effective-permissions';
import { makeAuthUser } from '../../common/testing/make-auth-user';
import type { Env } from '../../config/env.schema';
import type { AuthUser } from './decorators/current-user.decorator';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import { PermissionsGuard } from './guards/permissions.guard';

const DECIDE: Permission = 'vehicles.planner_transfer.decide';

function me(user: AuthUser): Promise<UserDto> {
  const controller = new AuthController(
    {} as unknown as AuthService,
    {} as unknown as ConfigService<Env, true>,
  );
  return controller.me(user);
}

describe('GET /auth/me — permissions (docs/25 B4)', () => {
  it.each([false, true])(
    'planista lider=%s → toPermissionList(permissionsFor(planista, lider))',
    async (lider) => {
      const body = await me(makeAuthUser('planista', { lider }));

      expect(body.permissions).toEqual(toPermissionList(new Set(permissionsFor('planista', lider))));
    },
  );

  it('only the lider planista lists vehicles.planner_transfer.decide', async () => {
    const plain = await me(makeAuthUser('planista', { lider: false }));
    const lead = await me(makeAuthUser('planista', { lider: true }));

    expect(plain.permissions).not.toContain(DECIDE);
    expect(lead.permissions).toContain(DECIDE);
    // Leader only adds: everything a plain planista may do is still listed.
    expect(lead.permissions).toEqual(expect.arrayContaining(plain.permissions));
  });

  it('serialises the request set, not the role (B6 overrides land in the set)', async () => {
    // Built out of catalog order on purpose.
    const user = makeAuthUser('przewoznik', {
      permissions: new Set<Permission>(['users.manage', 'claims.read']),
    });

    const body = await me(user);

    expect(body.permissions).toEqual(['claims.read', 'users.manage']);
  });

  it('an empty set lists nothing', async () => {
    const body = await me(makeAuthUser('admin', { permissions: new Set() }));

    expect(body.permissions).toEqual([]);
  });

  it('the whole body: every UserDto field, valid against the shared schema', async () => {
    const user = makeAuthUser('planista', {
      sub: '3f9a7c2e-6b1d-4e8a-9c0f-2d5b7e1a4c63',
      login: 'planistalider1',
      email: 'planistalider1@magtrans.eu',
      name: 'Planista lider 1',
      lider: true,
      teamId: null,
    });

    const body = await me(user);

    expect(body).toEqual({
      id: '3f9a7c2e-6b1d-4e8a-9c0f-2d5b7e1a4c63',
      login: 'planistalider1',
      email: 'planistalider1@magtrans.eu',
      name: 'Planista lider 1',
      role: 'planista',
      mustChangePassword: false,
      lider: true,
      permissions: [...permissionsFor('planista', true)],
    });
    // `z.object` strips unknown keys — equality after parse means none leaked.
    expect(UserDto.parse(body)).toEqual(body);
  });
});

describe('AuthController session-only routes through PermissionsGuard (docs/25 B5)', () => {
  type SessionHandler = 'me' | 'logout' | 'changePassword';
  const HANDLERS: readonly SessionHandler[] = ['me', 'logout', 'changePassword'];
  const guard = new PermissionsGuard(new Reflector());

  function guardContext(handler: SessionHandler, user?: AuthUser): ExecutionContext {
    const req = user === undefined ? {} : { user };
    return {
      getHandler: () => AuthController.prototype[handler],
      getClass: () => AuthController,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(HANDLERS.flatMap((handler) => RoleSchema.options.map((role) => [handler, role] as const)))(
    '%s admits %s',
    (handler, role) => {
      expect(guard.canActivate(guardContext(handler, makeAuthUser(role)))).toBe(true);
    },
  );

  it.each(HANDLERS)('%s admits a session holding no permission at all', (handler) => {
    const user = makeAuthUser('przewoznik', { permissions: new Set() });
    expect(guard.canActivate(guardContext(handler, user))).toBe(true);
  });

  it.each(HANDLERS)('%s: 403 without a request user', (handler) => {
    expect(() => guard.canActivate(guardContext(handler))).toThrow(ForbiddenException);
  });
});
