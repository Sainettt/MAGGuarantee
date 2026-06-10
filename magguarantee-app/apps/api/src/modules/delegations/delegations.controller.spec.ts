import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DelegationsController } from './delegations.controller';

/**
 * Authorization unit tests for the Phase 7 weryfikator transitions, plus the
 * regression that `cancel` stays carrier-only (owner decision 2026-06-10: the
 * verifier has NO cancel authority).
 *
 * Two layers, same pattern as `drivers.controller.spec.ts`:
 *   1. The `@Roles(...)` metadata on each handler is exactly the documented set
 *      (reflection — catches an accidental decorator drift).
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

const VERIFIER_TRANSITIONS: (keyof DelegationsController)[] = [
  'markInTransit',
  'markReturned',
];

describe('DelegationsController — Phase 7 authorization', () => {
  const guard = new RolesGuard(reflector);

  describe('@Roles metadata on verifier transitions', () => {
    it.each(VERIFIER_TRANSITIONS)(
      '%s is restricted to weryfikator + admin',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles.sort()).toEqual(['admin', 'weryfikator']);
        expect(roles).not.toContain('przewoznik');
        expect(roles).not.toContain('eksport');
      },
    );
  });

  describe('RolesGuard on verifier transitions', () => {
    it.each(VERIFIER_TRANSITIONS)('allows weryfikator on %s', (handler) => {
      expect(guard.canActivate(ctxFor(handler, userWith('weryfikator')))).toBe(
        true,
      );
    });

    it.each(VERIFIER_TRANSITIONS)('allows admin on %s', (handler) => {
      expect(guard.canActivate(ctxFor(handler, userWith('admin')))).toBe(true);
    });

    it.each(VERIFIER_TRANSITIONS)('rejects przewoznik on %s (403)', (handler) => {
      expect(() =>
        guard.canActivate(ctxFor(handler, userWith('przewoznik'))),
      ).toThrow(ForbiddenException);
    });

    it.each(VERIFIER_TRANSITIONS)('rejects eksport on %s (403)', (handler) => {
      expect(() =>
        guard.canActivate(ctxFor(handler, userWith('eksport'))),
      ).toThrow(ForbiddenException);
    });
  });

  describe('regression: cancel stays carrier-only (verifier has NO cancel)', () => {
    it('cancel is @Roles(przewoznik) only — unchanged by Phase 7', () => {
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
