import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DelegationsController } from './delegations.controller';
import { makeAuthUser } from '../../common/testing/make-auth-user';

/**
 * Authorization unit tests for the delegations surface after the Phase 7 REWORK
 * (2026-06-20 #4, docs/20 §0″): the outing lifecycle is operational again.
 *  - `eksport|admin` own `markReady` (`zgloszony↔gotowy`).
 *  - `weryfikator|admin` own `markInTransit` + `markReturned`.
 *  - `weryfikator` is BACK on `list` / `getOne` (active board, like eksport).
 *  - cancel: carrier (own `zgloszony`) + admin (any active); NOT weryfikator
 *    (it never cancels) and NOT eksport.
 *
 * Two layers, same pattern as `drivers.controller.spec.ts`:
 *   1. The `@Roles(...)` metadata on each handler is exactly the documented set
 *      (reflection — catches accidental decorator drift).
 *   2. `RolesGuard` actually accepts/rejects the right tokens.
 */

const reflector = new Reflector();

function handlerOf(
  name: keyof DelegationsController,
): (...args: never[]) => unknown {
  return DelegationsController.prototype[name] as (
    ...args: never[]
  ) => unknown;
}

function rolesFor(handlerName: keyof DelegationsController): Role[] {
  const meta = reflector.get<Role[] | undefined>(
    ROLES_METADATA_KEY,
    handlerOf(handlerName),
  );
  return meta ?? [];
}

function ctxFor(
  handlerName: keyof DelegationsController,
  user: AuthUser | undefined,
): ExecutionContext {
  const handler = handlerOf(handlerName);
  return {
    getHandler: () => handler,
    getClass: () => DelegationsController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function userWith(role: Role): AuthUser {
  return makeAuthUser(role, {
    sub: `u-${role}`,
    login: role,
    email: `${role}@magtrans.eu`,
    name: role,
    mustChangePassword: false,
  });
}

describe('DelegationsController — authorization (Phase 7 REWORK 2026-06-20 #4)', () => {
  const guard = new RolesGuard(reflector);

  describe('the verifier transition handlers exist again', () => {
    it('markReady / markInTransit / markReturned are methods on the controller', () => {
      const proto = DelegationsController.prototype as unknown as Record<
        string,
        unknown
      >;
      expect(typeof proto.markReady).toBe('function');
      expect(typeof proto.markInTransit).toBe('function');
      expect(typeof proto.markReturned).toBe('function');
    });
  });

  describe('list / getOne — weryfikator is back (active board like eksport)', () => {
    it.each(['list', 'getOne'] as const)(
      '%s includes BOTH eksport and weryfikator',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles).toEqual(
          expect.arrayContaining([
            'admin',
            'opiekun',
            'planista',
            'dyspozytor',
            'przewoznik',
            'eksport',
            'weryfikator',
          ]),
        );
      },
    );

    it.each(['list', 'getOne'] as const)(
      'RolesGuard allows weryfikator on %s',
      (handler) => {
        expect(
          guard.canActivate(ctxFor(handler, userWith('weryfikator'))),
        ).toBe(true);
      },
    );

    it.each(['list', 'getOne'] as const)(
      'RolesGuard allows eksport on %s',
      (handler) => {
        expect(guard.canActivate(ctxFor(handler, userWith('eksport')))).toBe(
          true,
        );
      },
    );
  });

  describe('markReady — eksport|admin', () => {
    it('is @Roles(eksport, admin)', () => {
      expect(rolesFor('markReady').sort()).toEqual(['admin', 'eksport']);
    });

    it.each(['eksport', 'admin'] as const)('RolesGuard allows %s', (role) => {
      expect(guard.canActivate(ctxFor('markReady', userWith(role)))).toBe(true);
    });

    it.each(['weryfikator', 'przewoznik', 'planista'] as const)(
      'RolesGuard rejects %s (403)',
      (role) => {
        expect(() =>
          guard.canActivate(ctxFor('markReady', userWith(role))),
        ).toThrow(ForbiddenException);
      },
    );
  });

  describe('markInTransit / markReturned — weryfikator|admin', () => {
    it.each(['markInTransit', 'markReturned'] as const)(
      '%s is @Roles(weryfikator, admin)',
      (handler) => {
        expect(rolesFor(handler).sort()).toEqual(['admin', 'weryfikator']);
      },
    );

    it.each(['markInTransit', 'markReturned'] as const)(
      'RolesGuard rejects eksport on %s (403)',
      (handler) => {
        expect(() =>
          guard.canActivate(ctxFor(handler, userWith('eksport'))),
        ).toThrow(ForbiddenException);
      },
    );

    it.each(['markInTransit', 'markReturned'] as const)(
      'RolesGuard allows weryfikator on %s',
      (handler) => {
        expect(
          guard.canActivate(ctxFor(handler, userWith('weryfikator'))),
        ).toBe(true);
      },
    );
  });

  describe('cancel — carrier + admin (verifier still has NO cancel)', () => {
    it('cancel is @Roles(przewoznik, admin)', () => {
      const roles = rolesFor('cancel');
      expect(roles.sort()).toEqual(['admin', 'przewoznik']);
      expect(roles).not.toContain('weryfikator');
      expect(roles).not.toContain('eksport');
    });

    it('RolesGuard rejects a weryfikator on cancel (403)', () => {
      expect(() =>
        guard.canActivate(ctxFor('cancel', userWith('weryfikator'))),
      ).toThrow(ForbiddenException);
    });

    it.each(['przewoznik', 'admin'] as const)(
      'RolesGuard allows %s on cancel',
      (role) => {
        expect(guard.canActivate(ctxFor('cancel', userWith(role)))).toBe(true);
      },
    );
  });
});
