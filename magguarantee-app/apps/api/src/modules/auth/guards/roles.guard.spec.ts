import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth.constants';
import type { AuthUser } from '../decorators/current-user.decorator';
import { RolesGuard } from './roles.guard';

function makeCtx(user: Partial<AuthUser> | null): ExecutionContext {
  const req = user === null ? {} : { user };
  // Reflector#getAllAndOverride passes [handler, class] as targets; jest's
  // `expect.anything()` rejects `undefined`, so we hand it stub Functions
  // that mirror what Nest passes at runtime.
  const handler = function handlerStub() {};
  const cls = function ControllerStub() {};
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

function makeReflector(roles?: Role[]): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('passes through when no @Roles metadata is set', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    const ctx = makeCtx({ role: 'przewoznik' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes through when @Roles is empty', () => {
    const guard = new RolesGuard(makeReflector([]));
    const ctx = makeCtx({ role: 'przewoznik' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when user role matches one required role', () => {
    const guard = new RolesGuard(makeReflector(['admin', 'pracownik']));
    const ctx = makeCtx({ role: 'admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when user role matches the only required role', () => {
    const guard = new RolesGuard(makeReflector(['weryfikator']));
    const ctx = makeCtx({ role: 'weryfikator' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws 403 when user role is not in the required set', () => {
    const guard = new RolesGuard(makeReflector(['admin']));
    const ctx = makeCtx({ role: 'przewoznik' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws 403 when req.user is missing', () => {
    const guard = new RolesGuard(makeReflector(['admin']));
    const ctx = makeCtx(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('reads metadata via getAllAndOverride (handler + class)', () => {
    const reflector = makeReflector(['admin']);
    const guard = new RolesGuard(reflector);
    const ctx = makeCtx({ role: 'admin' });
    guard.canActivate(ctx);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ROLES_METADATA_KEY,
      expect.arrayContaining([expect.anything(), expect.anything()]),
    );
  });
});
