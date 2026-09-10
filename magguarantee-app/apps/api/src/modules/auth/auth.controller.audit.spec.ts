// Regression guard: no `@Public()` auth route may carry `@Audit()`.
//
// The `AuditInterceptor` attributes its row to `req.user`. A public route has
// none, so it falls back to `actor: 'system'` — and `AuditWriter` refuses any
// action without the `system.` prefix for that actor. On `POST /auth/google`
// this turned every successful sign-in into an empty-bodied 500 (2026-09-10),
// and the interceptor's ambient transaction silently rolled back the
// `system.*` refusal rows the directory wrote before a 403. Public auth routes
// audit from the service, where the actor is known.

import { Reflector } from '@nestjs/core';

import { readAuditConfig } from '../../common/audit/testing/audit-coverage.harness';
import { IS_PUBLIC_KEY } from './auth.constants';
import { AuthController } from './auth.controller';

const reflector = new Reflector();

function publicMethods(): string[] {
  const proto = AuthController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((name) => {
    if (name === 'constructor') return false;
    const handler = proto[name];
    if (typeof handler !== 'function') return false;
    return Boolean(
      reflector.get<boolean | undefined>(
        IS_PUBLIC_KEY,
        handler as (...args: never[]) => unknown,
      ),
    );
  });
}

describe('AuthController — public routes carry no @Audit()', () => {
  it('finds the public routes (sanity check on the scan itself)', () => {
    expect(publicMethods()).toEqual(
      expect.arrayContaining(['login', 'verify', 'google', 'refresh']),
    );
  });

  it.each(publicMethods())('%s has no @Audit() metadata', (method) => {
    expect(readAuditConfig(AuthController, method)).toBeUndefined();
  });
});
