import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DelegationsController } from './delegations.controller';

/**
 * Authorization unit tests for the delegations surface after the Phase 7
 * rework (2026-06-10 #2): the weryfikator no longer touches delegations — its
 * former in-transit/returned handlers were removed and it was dropped from the
 * `list` / `getOne` `@Roles`. `eksport` stays on the outings board; cancel
 * stays carrier-only.
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
  return {
    sub: `u-${role}`,
    login: role,
    email: `${role}@magtrans.eu`,
    name: role,
    role,
  };
}

describe('DelegationsController — authorization (post Phase 7 rework)', () => {
  const guard = new RolesGuard(reflector);

  describe('the verifier transition handlers no longer exist', () => {
    it('markInTransit / markReturned are not methods on the controller', () => {
      const proto = DelegationsController.prototype as unknown as Record<
        string,
        unknown
      >;
      expect(proto.markInTransit).toBeUndefined();
      expect(proto.markReturned).toBeUndefined();
    });
  });

  describe('list / getOne — eksport kept, weryfikator dropped', () => {
    it.each(['list', 'getOne'] as const)(
      '%s includes eksport but NOT weryfikator',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles).toContain('eksport');
        expect(roles).not.toContain('weryfikator');
        // The other documented readers are unchanged.
        expect(roles).toEqual(
          expect.arrayContaining([
            'admin',
            'opiekun',
            'planista',
            'dyspozytor',
            'przewoznik',
            'eksport',
          ]),
        );
      },
    );

    it.each(['list', 'getOne'] as const)(
      'RolesGuard rejects weryfikator on %s (403)',
      (handler) => {
        expect(() =>
          guard.canActivate(ctxFor(handler, userWith('weryfikator'))),
        ).toThrow(ForbiddenException);
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

  describe('cancel stays carrier-only (verifier has NO cancel)', () => {
    it('cancel is @Roles(przewoznik) only', () => {
      const roles = rolesFor('cancel');
      expect(roles).toEqual(['przewoznik']);
      expect(roles).not.toContain('weryfikator');
      expect(roles).not.toContain('admin');
      expect(roles).not.toContain('eksport');
    });

    it('RolesGuard rejects a weryfikator on cancel (403)', () => {
      expect(() =>
        guard.canActivate(ctxFor('cancel', userWith('weryfikator'))),
      ).toThrow(ForbiddenException);
    });

    it('RolesGuard allows a przewoznik on cancel', () => {
      expect(guard.canActivate(ctxFor('cancel', userWith('przewoznik')))).toBe(
        true,
      );
    });
  });
});
