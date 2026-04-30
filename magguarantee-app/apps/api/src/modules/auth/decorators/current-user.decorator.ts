import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Role } from '@magguarantee/shared';

/**
 * Shape attached to `req.user` by JwtAccessStrategy after a successful JWT
 * validation. Controllers consume this via `@CurrentUser()`.
 */
export interface AuthUser {
  sub: string; // userId
  login: string;
  email: string;
  name: string;
  role: Role;
  jti?: string; // present only on refresh tokens
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user) {
      // This should be impossible — the global JwtAuthGuard runs first and
      // would have thrown 401 by now. Keep the assertion to surface bugs.
      throw new Error('CurrentUser decorator used on a route without JWT guard');
    }
    return req.user;
  },
);
