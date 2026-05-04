import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth.constants';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Reads `@Roles(...)` metadata and asserts the authenticated user's role is
 * in the allowed set.
 *
 * Per docs/15-auth-strategy.md#guards:
 *  - No `@Roles()` declared → opt-in, guard passes through (true).
 *  - Missing `req.user` → guard returns false (the global JwtAuthGuard would
 *    have thrown 401 first; this is defence in depth).
 *  - Role mismatch → 403 with RFC 7807-friendly payload (the global
 *    HttpException → JSON serialiser yields `{statusCode, message, ...}`).
 *
 * Future: when multi-role lands (alternateRoles in JWT), this guard should
 * union `[user.role, ...user.alternateRoles]` per docs line 236. Phase 1
 * JWTs only carry the primary role, so for now we check `user.role` only.
 * The `AuthUser` shape is the contract.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    // Decorator-driven: no metadata → no opinion.
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      // Unauthenticated. JwtAuthGuard runs first and would normally produce
      // 401; if we somehow ran without it, surface as 403 to avoid leaking
      // the JWT-state to an unauthenticated caller.
      throw new ForbiddenException('Brak uprawnień');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Brak uprawnień dla tej roli');
    }
    return true;
  }
}
