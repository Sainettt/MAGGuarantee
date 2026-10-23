import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { rolesSatisfying, type Permission, type Role } from '@magguarantee/shared';

import { makeAuthUser } from '../../common/testing/make-auth-user';
import { PERMISSIONS_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DelegationsController } from './delegations.controller';

/**
 * Authorization unit tests for the delegations surface after the Phase 7 REWORK
 * (2026-06-20 #4, docs/20 §0″): the outing lifecycle is operational again.
 *  - `eksport|admin` own `markReady` (`zgloszony↔gotowy`).
 *  - `weryfikator|admin` own `markInTransit` + `markReturned`.
 *  - `weryfikator` is BACK on `list` / `getOne` (active board, like eksport).
 *  - cancel: carrier (own `zgloszony`) + admin (any active); NOT weryfikator
 *    (it never cancels) and NOT eksport.
 *
 * Track B (docs/25 §3 B2): the routes carry `@RequirePermission` instead of
 * `@Roles`. Two layers, same pattern as `claims.controller.roles.spec.ts`:
 *   1. The `@RequirePermission(...)` metadata on each handler is exactly the
 *      requirement recorded in the generated fixture
 *      (`common/authz/__fixtures__/endpoint-permissions.snapshot.json`), and
 *      the catalog maps it onto the documented role set (reflection — catches
 *      accidental decorator or catalog drift).
 *   2. `PermissionsGuard` actually lets through / refuses users built the way
 *      `JwtAccessStrategy` builds them (`makeAuthUser(role)`), over the same
 *      role matrices the former `RolesGuard` checks used.
 */

const reflector = new Reflector();

function handlerOf(
  name: keyof DelegationsController,
): (...args: never[]) => unknown {
  return DelegationsController.prototype[name] as (
    ...args: never[]
  ) => unknown;
}

/** The live requirement, resolved like `PermissionsGuard` does (handler, then class). */
function requiredFor(handlerName: keyof DelegationsController): Permission[] {
  const meta = reflector.getAllAndOverride<Permission[] | undefined>(
    PERMISSIONS_METADATA_KEY,
    [handlerOf(handlerName), DelegationsController],
  );
  return meta ?? [];
}

/** Who the catalog admits through that requirement (leader rule as in the snapshot). */
function admittedRoles(handlerName: keyof DelegationsController): Role[] {
  return rolesSatisfying(requiredFor(handlerName), { lider: true });
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

describe('DelegationsController — authorization (Phase 7 REWORK 2026-06-20 #4)', () => {
  const guard = new PermissionsGuard(reflector);

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
      '%s requires exactly delegations.read',
      (handler) => {
        expect(requiredFor(handler)).toEqual(['delegations.read']);
      },
    );

    it.each(['list', 'getOne'] as const)(
      '%s admits BOTH eksport and weryfikator',
      (handler) => {
        expect(admittedRoles(handler)).toEqual(
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
      'PermissionsGuard allows weryfikator on %s',
      (handler) => {
        expect(
          guard.canActivate(ctxFor(handler, makeAuthUser('weryfikator'))),
        ).toBe(true);
      },
    );

    it.each(['list', 'getOne'] as const)(
      'PermissionsGuard allows eksport on %s',
      (handler) => {
        expect(guard.canActivate(ctxFor(handler, makeAuthUser('eksport')))).toBe(
          true,
        );
      },
    );
  });

  describe('markReady — eksport|admin', () => {
    it('requires exactly delegations.mark_ready', () => {
      expect(requiredFor('markReady')).toEqual(['delegations.mark_ready']);
    });

    it('which admits exactly eksport + admin', () => {
      expect(admittedRoles('markReady').sort()).toEqual(['admin', 'eksport']);
    });

    it.each(['eksport', 'admin'] as const)('PermissionsGuard allows %s', (role) => {
      expect(guard.canActivate(ctxFor('markReady', makeAuthUser(role)))).toBe(
        true,
      );
    });

    it.each(['weryfikator', 'przewoznik', 'planista'] as const)(
      'PermissionsGuard rejects %s (403)',
      (role) => {
        expect(() =>
          guard.canActivate(ctxFor('markReady', makeAuthUser(role))),
        ).toThrow(ForbiddenException);
      },
    );
  });

  describe('markInTransit / markReturned — weryfikator|admin', () => {
    it.each(['markInTransit', 'markReturned'] as const)(
      '%s requires exactly delegations.transit',
      (handler) => {
        expect(requiredFor(handler)).toEqual(['delegations.transit']);
      },
    );

    it.each(['markInTransit', 'markReturned'] as const)(
      '%s admits exactly weryfikator + admin',
      (handler) => {
        expect(admittedRoles(handler).sort()).toEqual(['admin', 'weryfikator']);
      },
    );

    it.each(['markInTransit', 'markReturned'] as const)(
      'PermissionsGuard rejects eksport on %s (403)',
      (handler) => {
        expect(() =>
          guard.canActivate(ctxFor(handler, makeAuthUser('eksport'))),
        ).toThrow(ForbiddenException);
      },
    );

    it.each(['markInTransit', 'markReturned'] as const)(
      'PermissionsGuard allows weryfikator on %s',
      (handler) => {
        expect(
          guard.canActivate(ctxFor(handler, makeAuthUser('weryfikator'))),
        ).toBe(true);
      },
    );
  });

  describe('cancel — carrier + admin (verifier still has NO cancel)', () => {
    it('cancel requires exactly delegations.cancel (przewoznik + admin)', () => {
      expect(requiredFor('cancel')).toEqual(['delegations.cancel']);
      const roles = admittedRoles('cancel');
      expect([...roles].sort()).toEqual(['admin', 'przewoznik']);
      expect(roles).not.toContain('weryfikator');
      expect(roles).not.toContain('eksport');
    });

    it('PermissionsGuard rejects a weryfikator on cancel (403)', () => {
      expect(() =>
        guard.canActivate(ctxFor('cancel', makeAuthUser('weryfikator'))),
      ).toThrow(ForbiddenException);
    });

    it.each(['przewoznik', 'admin'] as const)(
      'PermissionsGuard allows %s on cancel',
      (role) => {
        expect(guard.canActivate(ctxFor('cancel', makeAuthUser(role)))).toBe(
          true,
        );
      },
    );
  });
});
