// Regression guard: every public auth route carries its own @Throttle().
//
// The global 100/min/IP default is sized for authenticated app traffic, not
// for endpoints anyone on the internet can hit without a session. POST
// /auth/refresh was the one public route without an override until the
// logging/audit-trail audit (2026-08-14, §4).

import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from './auth.constants';
import { AuthController } from './auth.controller';

// `@nestjs/throttler` stores per-route overrides under `THROTTLER:<field><name>`
// (not exported from the package index).
const TTL_KEY = 'THROTTLER:TTLdefault';
const LIMIT_KEY = 'THROTTLER:LIMITdefault';

const reflector = new Reflector();
const proto = AuthController.prototype as unknown as Record<string, unknown>;

function handler(name: string): (...args: never[]) => unknown {
  return proto[name] as (...args: never[]) => unknown;
}

function publicMethods(): string[] {
  return Object.getOwnPropertyNames(proto).filter(
    (name) =>
      name !== 'constructor' &&
      typeof proto[name] === 'function' &&
      Boolean(reflector.get<boolean | undefined>(IS_PUBLIC_KEY, handler(name))),
  );
}

describe('AuthController — public routes carry a per-route throttle', () => {
  it.each(publicMethods())('%s has @Throttle({ default })', (method) => {
    expect(Reflect.getMetadata(TTL_KEY, handler(method))).toBe(60_000);
    expect(typeof Reflect.getMetadata(LIMIT_KEY, handler(method))).toBe('number');
  });

  it('covers /auth/refresh', () => {
    expect(publicMethods()).toContain('refresh');
  });
});
