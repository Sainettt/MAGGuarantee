// PermissionsGuard (docs/25 §3 B2.0, B5; docs/15 §Roles & Guards). Real
// decorators on synthetic controllers + a real Reflector: the metadata is
// resolved exactly as at runtime (`getAllAndOverride([handler, class])`,
// handler wins). The branches, in order: @Public → allow; @AuthenticatedOnly →
// allow iff `req.user`; @RequirePermission without `req.user.permissions` →
// 403 (fail closed), else any-of; nothing declared → 403 (deny by default,
// since B5 — it used to be "allow").

import { ExecutionContext, ForbiddenException, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { makeAuthUser } from '../../../common/testing/make-auth-user';
import {
  FORBIDDEN_NO_USER_MESSAGE,
  FORBIDDEN_NOT_GRANTED_MESSAGE,
  PERMISSIONS_METADATA_KEY,
} from '../auth.constants';
import { AuthenticatedOnly } from '../decorators/authenticated-only.decorator';
import { Public } from '../decorators/public.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import type { RefreshRequestData } from '../strategies/jwt-refresh.strategy';
import { PermissionsGuard } from './permissions.guard';

const SESSION_REASON = 'Every signed-in user reads this synthetic route.';

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

  // Handler @AuthenticatedOnly under a class @RequirePermission: a
  // contradiction the snapshot specs flag; at runtime step 2 comes first.
  @AuthenticatedOnly(SESSION_REASON)
  sessionUnderGatedClass(): void {}
}

class PlainController {
  undecided(): void {}

  @AuthenticatedOnly(SESSION_REASON)
  session(): void {}

  @Public()
  refresh(): void {}

  @Public()
  @RequirePermission('users.manage')
  publicWithRequirement(): void {}

  @Public()
  @AuthenticatedOnly(SESSION_REASON)
  publicAndSession(): void {}

  // Metadata of a decorator this guard does not read (the key the former
  // `@Roles` wrote) is no decision: still denied by default.
  @SetMetadata('roles', ['admin'])
  foreignMetadataOnly(): void {}
}

@AuthenticatedOnly(SESSION_REASON)
class SessionController {
  inherits(): void {}

  @RequirePermission('users.manage')
  handlerRequirement(): void {}
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

    it('wins over an @AuthenticatedOnly on the same route (the snapshot spec flags the pair)', () => {
      expect(guard.canActivate(ctx(PlainController, 'publicAndSession'))).toBe(true);
    });
  });

  describe('2. @AuthenticatedOnly → allow iff req.user exists', () => {
    it('allows every role, whatever its permission set', () => {
      expect(guard.canActivate(ctx(PlainController, 'session', makeAuthUser('dyspozytor')))).toBe(true);
      expect(guard.canActivate(ctx(PlainController, 'session', makeAuthUser('weryfikator')))).toBe(true);
      const holdsNothing = makeAuthUser('przewoznik', { permissions: new Set() });
      expect(guard.canActivate(ctx(PlainController, 'session', holdsNothing))).toBe(true);
    });

    it('does not read the permission set: a user object without one passes', () => {
      expect(guard.canActivate(ctx(PlainController, 'session', REFRESH_PAYLOAD))).toBe(true);
    });

    it('denies a request without a user, and says so in the log', () => {
      expect(forbiddenMessage(() => guard.canActivate(ctx(PlainController, 'session')))).toBe(
        FORBIDDEN_NO_USER_MESSAGE,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ handler: 'PlainController.session' }),
      );
    });

    it('a class @AuthenticatedOnly covers its handlers', () => {
      expect(guard.canActivate(ctx(SessionController, 'inherits', makeAuthUser('eksport')))).toBe(true);
      expect(() => guard.canActivate(ctx(SessionController, 'inherits'))).toThrow(ForbiddenException);
    });

    it('comes before @RequirePermission when both resolve (the snapshot specs flag the pair)', () => {
      // Handler @AuthenticatedOnly under a class requirement, and the reverse.
      const dyspozytor = makeAuthUser('dyspozytor');
      expect(guard.canActivate(ctx(GatedController, 'sessionUnderGatedClass', dyspozytor))).toBe(true);
      expect(guard.canActivate(ctx(SessionController, 'handlerRequirement', dyspozytor))).toBe(true);
    });
  });

  describe('3a. @RequirePermission, no permission set on req.user → 403, fail closed', () => {
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

  describe('3b. @RequirePermission → any-of against req.user.permissions', () => {
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

  describe('4. nothing declared → 403, deny by default (docs/25 B5)', () => {
    it('denies every role, admin included', () => {
      for (const role of ['admin', 'pracownik', 'przewoznik'] as const) {
        expect(() =>
          guard.canActivate(ctx(PlainController, 'undecided', makeAuthUser(role))),
        ).toThrow(ForbiddenException);
      }
    });

    it('denies an anonymous request and a refresh-token payload', () => {
      expect(() => guard.canActivate(ctx(PlainController, 'undecided'))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx(PlainController, 'undecided', REFRESH_PAYLOAD))).toThrow(
        ForbiddenException,
      );
    });

    it('metadata of a decorator the guard does not read is not a decision', () => {
      expect(() =>
        guard.canActivate(ctx(PlainController, 'foreignMetadataOnly', makeAuthUser('admin'))),
      ).toThrow(ForbiddenException);
    });

    it('warns once with the handler name and nothing from the request', () => {
      expect(() => guard.canActivate(ctx(PlainController, 'undecided', REFRESH_PAYLOAD))).toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      const [entry] = warn.mock.calls[0] as [{ handler: string; msg: string }];
      expect(entry.handler).toBe('PlainController.undecided');
      expect(entry.msg).toContain('deny by default');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('raw-refresh');
    });
  });

  describe('403 bodies (pinned literally: the web may show them)', () => {
    it('the two messages are exactly these strings', () => {
      expect(FORBIDDEN_NO_USER_MESSAGE).toBe('Brak uprawnień');
      expect(FORBIDDEN_NOT_GRANTED_MESSAGE).toBe('Brak uprawnień dla tej roli');
    });

    it('not granted', () => {
      const user = makeAuthUser('przewoznik');
      expect(forbiddenMessage(() => guard.canActivate(ctx(GatedController, 'overrides', user)))).toBe(
        'Brak uprawnień dla tej roli',
      );
    });

    it('no user / no permission set', () => {
      expect(forbiddenMessage(() => guard.canActivate(ctx(GatedController, 'inherits')))).toBe(
        'Brak uprawnień',
      );
      expect(
        forbiddenMessage(() => guard.canActivate(ctx(GatedController, 'inherits', REFRESH_PAYLOAD))),
      ).toBe('Brak uprawnień');
    });

    it('no decision: the generic body, nothing about the route', () => {
      const admin = makeAuthUser('admin');
      expect(forbiddenMessage(() => guard.canActivate(ctx(PlainController, 'undecided', admin)))).toBe(
        'Brak uprawnień',
      );
    });
  });
});
