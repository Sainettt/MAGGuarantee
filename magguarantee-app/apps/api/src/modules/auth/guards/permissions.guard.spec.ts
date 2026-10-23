// PermissionsGuard (docs/25 §3 B2.0, docs/15 §Roles & Guards). Real decorators
// on synthetic controllers + a real Reflector: the metadata is resolved
// exactly as at runtime (`getAllAndOverride([handler, class])`, handler wins).
// The four branches, in order: @Public → allow; no metadata → allow;
// metadata without `req.user.permissions` → 403 (fail closed); else any-of.

import { ExecutionContext, ForbiddenException, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { makeAuthUser } from '../../../common/testing/make-auth-user';
import { PERMISSIONS_METADATA_KEY, ROLES_METADATA_KEY } from '../auth.constants';
import { Public } from '../decorators/public.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import type { RefreshRequestData } from '../strategies/jwt-refresh.strategy';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

@RequirePermission('claims.read', 'claims.verify')
class GatedController {
  inherits(): void {}

  @RequirePermission('users.manage')
  overrides(): void {}

  @RequirePermission('vehicles.planner_transfer.decide')
  decide(): void {}

  // Not writable with the typed decorator; raw metadata models a bug.
  @SetMetadata(PERMISSIONS_METADATA_KEY, [])
  emptyRequirement(): void {}
}

class PlainController {
  free(): void {}

  @Public()
  refresh(): void {}

  @Public()
  @RequirePermission('users.manage')
  publicWithRequirement(): void {}

  // `@Roles` is RolesGuard's business; PermissionsGuard has no opinion on it.
  @SetMetadata(ROLES_METADATA_KEY, ['admin'])
  rolesOnly(): void {}
}

type Handler = (...args: never[]) => unknown;

function ctx(controller: new () => object, handler: string, user?: unknown): ExecutionContext {
  const proto = controller.prototype as Record<string, unknown>;
  const req = user === undefined ? {} : { user };
  return {
    getHandler: () => proto[handler] as Handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function forbiddenMessage(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    if (err instanceof ForbiddenException) return err.message;
    throw err;
  }
  throw new Error('expected a ForbiddenException');
}

const REFRESH_PAYLOAD: RefreshRequestData = { sub: 'u-1', jti: 'j-1', rawToken: 'raw-refresh' };

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. @Public → allow', () => {
    it('lets the refresh-token payload through (it has no permissions)', () => {
      expect(guard.canActivate(ctx(PlainController, 'refresh', REFRESH_PAYLOAD))).toBe(true);
    });

    it('lets an anonymous request through', () => {
      expect(guard.canActivate(ctx(PlainController, 'refresh'))).toBe(true);
    });

    it('wins over a @RequirePermission on the same route (the snapshot spec flags the pair)', () => {
      expect(guard.canActivate(ctx(PlainController, 'publicWithRequirement'))).toBe(true);
    });
  });

  describe('2. no @RequirePermission metadata → allow (transition)', () => {
    it('allows any authenticated user', () => {
      expect(guard.canActivate(ctx(PlainController, 'free', makeAuthUser('dyspozytor')))).toBe(true);
    });

    it('allows even a user object without permissions: no metadata, no opinion', () => {
      expect(guard.canActivate(ctx(PlainController, 'free', REFRESH_PAYLOAD))).toBe(true);
      expect(guard.canActivate(ctx(PlainController, 'free'))).toBe(true);
    });

    it('ignores @Roles metadata (RolesGuard enforces it)', () => {
      const user = makeAuthUser('przewoznik');
      expect(guard.canActivate(ctx(PlainController, 'rolesOnly', user))).toBe(true);
    });
  });

  describe('3. metadata present, no permission set on req.user → 403, fail closed', () => {
    it('denies a request without a user', () => {
      expect(() => guard.canActivate(ctx(GatedController, 'inherits'))).toThrow(ForbiddenException);
    });

    it('denies the refresh-token payload', () => {
      expect(() => guard.canActivate(ctx(GatedController, 'inherits', REFRESH_PAYLOAD))).toThrow(
        ForbiddenException,
      );
    });

    it('never recomputes from the role: an admin-shaped user without the set is denied', () => {
      const { permissions: _dropped, ...adminWithoutSet } = makeAuthUser('admin');
      expect(() => guard.canActivate(ctx(GatedController, 'overrides', adminWithoutSet))).toThrow(
        ForbiddenException,
      );
    });

    it('accepts only a real Set: an array of the right strings is still denied', () => {
      const user = { ...makeAuthUser('admin'), permissions: ['users.manage'] };
      expect(() => guard.canActivate(ctx(GatedController, 'overrides', user))).toThrow(
        ForbiddenException,
      );
    });

    it('logs the denial with the handler, never the user object', () => {
      expect(() => guard.canActivate(ctx(GatedController, 'inherits', REFRESH_PAYLOAD))).toThrow();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ handler: 'GatedController.inherits', hasUser: true }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain('raw-refresh');
    });
  });

  describe('4. any-of against req.user.permissions', () => {
    it('allows when the user holds one of the required permissions (class level, inherited)', () => {
      // pracownik: claims.read + claims.verify; przewoznik: claims.read only.
      expect(guard.canActivate(ctx(GatedController, 'inherits', makeAuthUser('pracownik')))).toBe(true);
      expect(guard.canActivate(ctx(GatedController, 'inherits', makeAuthUser('przewoznik')))).toBe(true);
    });

    it('denies when the user holds none of them', () => {
      const user = makeAuthUser('dyspozytor');
      expect(() => guard.canActivate(ctx(GatedController, 'inherits', user))).toThrow(
        ForbiddenException,
      );
    });

    it('the handler requirement replaces the class one', () => {
      // pracownik satisfies the class requirement but not the handler's.
      const pracownik = makeAuthUser('pracownik');
      expect(() => guard.canActivate(ctx(GatedController, 'overrides', pracownik))).toThrow(
        ForbiddenException,
      );
      expect(guard.canActivate(ctx(GatedController, 'overrides', makeAuthUser('admin')))).toBe(true);
    });

    it('reads the set, not the role: the leader flag is what lets a planista decide', () => {
      const plain = makeAuthUser('planista');
      const lider = makeAuthUser('planista', { lider: true });
      expect(() => guard.canActivate(ctx(GatedController, 'decide', plain))).toThrow(
        ForbiddenException,
      );
      expect(guard.canActivate(ctx(GatedController, 'decide', lider))).toBe(true);
    });

    it('an explicit set wins over the role (the B6 extension point)', () => {
      const user = makeAuthUser('przewoznik', { permissions: new Set(['users.manage'] as const) });
      expect(guard.canActivate(ctx(GatedController, 'overrides', user))).toBe(true);
    });

    it('an empty requirement admits nobody, not even admin', () => {
      const admin = makeAuthUser('admin');
      expect(() => guard.canActivate(ctx(GatedController, 'emptyRequirement', admin))).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('403 bodies match RolesGuard (B2a–c swaps must not change responses)', () => {
    const roles = new RolesGuard(reflector);

    it('not granted', () => {
      const user = makeAuthUser('przewoznik');
      expect(forbiddenMessage(() => guard.canActivate(ctx(GatedController, 'overrides', user)))).toBe(
        forbiddenMessage(() => roles.canActivate(ctx(PlainController, 'rolesOnly', user))),
      );
    });

    it('no user', () => {
      expect(forbiddenMessage(() => guard.canActivate(ctx(GatedController, 'inherits')))).toBe(
        forbiddenMessage(() => roles.canActivate(ctx(PlainController, 'rolesOnly'))),
      );
    });
  });
});
