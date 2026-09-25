// POST /sso/access-grants — the route-level contract (docs/13 «SSO», docs/24 §10):
//  - admin-only via the real RolesGuard + the controller's real @Roles metadata;
//  - audited by the real AuditInterceptor, attributed to the admin, WITHOUT an
//    interceptor transaction (the handler calls MAGSpace — docs/13 «Audit на
//    уровне API»);
//  - body validated by the shared GrantSsoAccessSchema.
//
// The grant's decision logic is in directory.service.spec.ts.

import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  GrantSsoAccessSchema,
  SetStanowiskoRoleSchema,
  USER_LIDER_REQUIRES_LIDER_ROLE,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  readAuditConfig,
  runAuditedHandler,
  type HarnessRequest,
} from '../../common/audit/testing/audit-coverage.harness';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SsoController } from './sso.controller';

const ADMIN: HarnessRequest['user'] = {
  sub: 'admin-1',
  login: 'admin',
  email: 'admin@magtrans.eu',
  name: 'Admin',
  role: 'admin',
  mustChangePassword: false,
};

const PRACOWNIK: HarnessRequest['user'] = {
  sub: 'prac-1',
  login: 'prac',
  email: 'prac@magtrans.eu',
  name: 'Pracownik',
  role: 'pracownik',
  mustChangePassword: false,
};

function guardContext(user: HarnessRequest['user']): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => SsoController.prototype.grant,
    getClass: () => SsoController,
  } as unknown as ExecutionContext;
}

describe('SsoController — POST /sso/access-grants', () => {
  describe('audit', () => {
    it('carries @Audit(grantSsoAccess) with manualTransaction', () => {
      const config = readAuditConfig(SsoController, 'grant') as
        | { action: string; targetType?: string; manualTransaction?: boolean; targetKey?: unknown }
        | undefined;

      expect(config).toMatchObject({
        action: 'grantSsoAccess',
        targetType: 'User',
        manualTransaction: true,
      });
      expect(typeof config?.targetKey).toBe('function');
    });

    it('writes one row for the admin, keyed on the login, with the service snapshot — and no transaction', async () => {
      const out = await runAuditedHandler({
        controller: SsoController,
        method: 'grant',
        req: {
          user: ADMIN,
          params: {},
          body: { email: 'jan.kowalski@magtrans.eu', role: 'eksport' },
          headers: { 'user-agent': 'jest' },
          ip: '10.0.0.7',
          method: 'POST',
          url: '/api/v1/sso/access-grants',
        },
        result: {
          user: {
            id: 'u-9',
            login: 'jan.kowalski',
            role: 'eksport',
            active: true,
            managedBy: 'magspace',
            roleOverride: 'eksport',
            lider: false,
          },
          outcome: 'reactivated',
        },
        // What DirectoryService.grantAccess contributes mid-handler.
        duringHandler: () => {
          AuditContext.setBefore({
            user: { role: 'pracownik', lider: false, active: false, managedBy: 'magspace', roleOverride: 'pracownik' },
          });
          AuditContext.setMetadata({
            outcome: 'reactivated',
            stanowiskoCode: 'CONTROLLING',
            magspaceEmployeeId: 'emp-1',
          });
        },
      });

      expect(out.entries).toHaveLength(1);
      // The handler calls MAGSpace: no interactive transaction may be held open.
      expect(out.txOpens).toBe(0);
      expect(out.entry!.action).toBe('grantSsoAccess');
      expect(out.entry!.targetType).toBe('User');
      expect(out.entry!.targetKey).toBe('jan.kowalski');
      expect(out.entry!.actor).toEqual({
        userId: 'admin-1',
        userRole: 'admin',
        ipAddress: '10.0.0.7',
      });
      // Nested under `user`, so it survives the trim to the response key-set.
      expect(out.entry!.before).toEqual({
        user: { role: 'pracownik', lider: false, active: false, managedBy: 'magspace', roleOverride: 'pracownik' },
      });
      expect(out.entry!.metadata).toMatchObject({
        outcome: 'reactivated',
        stanowiskoCode: 'CONTROLLING',
        magspaceEmployeeId: 'emp-1',
      });
    });
  });

  describe('access', () => {
    const guard = new RolesGuard(new Reflector());

    it('lets an admin through', () => {
      expect(guard.canActivate(guardContext(ADMIN))).toBe(true);
    });

    it('403 for any other role', () => {
      expect(() => guard.canActivate(guardContext(PRACOWNIK))).toThrow(ForbiddenException);
    });

    it('403 without an authenticated user (defence in depth behind JwtAuthGuard)', () => {
      expect(() => guard.canActivate(guardContext(undefined))).toThrow(ForbiddenException);
    });
  });

  describe('body (GrantSsoAccessSchema)', () => {
    it('normalises the address the way MAGSpace does', () => {
      expect(
        GrantSsoAccessSchema.parse({ email: '  Jan.Kowalski@MAGTRANS.eu ', role: 'weryfikator' }),
      ).toEqual({ email: 'jan.kowalski@magtrans.eu', role: 'weryfikator' });
    });

    it.each(['admin', 'przewoznik'])('rejects the non-assignable role %s', (role) => {
      expect(
        GrantSsoAccessSchema.safeParse({ email: 'jan.kowalski@magtrans.eu', role }).success,
      ).toBe(false);
    });

    it('rejects unknown keys and a malformed address', () => {
      expect(
        GrantSsoAccessSchema.safeParse({
          email: 'jan.kowalski@magtrans.eu',
          role: 'eksport',
          managedBy: 'local',
        }).success,
      ).toBe(false);
      expect(GrantSsoAccessSchema.safeParse({ email: 'nope', role: 'eksport' }).success).toBe(false);
    });

    // docs/28 — the leader flag rides on the grant.
    it('accepts a leader grant and leaves an omitted flag absent', () => {
      expect(
        GrantSsoAccessSchema.parse({ email: 'jan.kowalski@magtrans.eu', role: 'opiekun', lider: true }),
      ).toEqual({ email: 'jan.kowalski@magtrans.eu', role: 'opiekun', lider: true });
      expect(
        GrantSsoAccessSchema.parse({ email: 'jan.kowalski@magtrans.eu', role: 'opiekun' }),
      ).not.toHaveProperty('lider');
    });

    it('through the route’s pipe, lider on weryfikator is 422 USER_LIDER_REQUIRES_LIDER_ROLE, not 400', () => {
      const pipe = new ZodValidationPipe(GrantSsoAccessSchema);
      let caught: unknown;
      try {
        pipe.transform(
          { email: 'jan.kowalski@magtrans.eu', role: 'weryfikator', lider: true },
          { type: 'body' },
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      expect((caught as UnprocessableEntityException).getResponse()).toMatchObject({
        extensions: { code: USER_LIDER_REQUIRES_LIDER_ROLE },
      });
    });
  });
});

describe('SsoController — PUT /sso/stanowisko-roles/:code body', () => {
  const pipe = new ZodValidationPipe(SetStanowiskoRoleSchema);

  it('passes `{ role }` through without inventing a flag (the service keeps the stored one)', () => {
    expect(pipe.transform({ role: 'planista' }, { type: 'body' })).toEqual({ role: 'planista' });
  });

  it('passes an explicit leader mapping', () => {
    expect(pipe.transform({ role: 'dyspozytor', lider: true }, { type: 'body' })).toEqual({
      role: 'dyspozytor',
      lider: true,
    });
  });

  it('refuses lider on weryfikator with 422 + code', () => {
    expect(() => pipe.transform({ role: 'weryfikator', lider: true }, { type: 'body' })).toThrow(
      UnprocessableEntityException,
    );
  });

  it('keeps 400 for a shape error', () => {
    expect(() => pipe.transform({ role: 'planista', lider: 'tak' }, { type: 'body' })).toThrow(
      BadRequestException,
    );
  });
});
