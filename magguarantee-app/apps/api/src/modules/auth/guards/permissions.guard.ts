import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { grantedPermissions } from '../../../common/authz/can';
import {
  FORBIDDEN_NO_USER_MESSAGE,
  FORBIDDEN_NOT_GRANTED_MESSAGE,
  IS_PUBLIC_KEY,
  PERMISSIONS_METADATA_KEY,
} from '../auth.constants';

/**
 * Reads `@RequirePermission(...)` metadata and asserts the authenticated user
 * holds at least one of the listed permissions (any-of, like `@Roles`).
 *
 * Global `APP_GUARD`, registered AFTER `RolesGuard` (app.module.ts: Throttler →
 * JwtAuth → Roles → Permissions; controller `@UseGuards`, e.g. the ownership
 * guards, run after all of them). Per docs/25 §3 B2 and docs/15 §Roles & Guards,
 * in this order:
 *  1. `@Public` (same `IS_PUBLIC_KEY` lookup as `JwtAuthGuard`) → allow. On
 *     `POST /auth/refresh` `req.user` is the refresh-token payload, which has
 *     no `permissions`.
 *  2. No `@RequirePermission` metadata (`getAllAndOverride([handler, class])`)
 *     → allow: a session-only route. The inverse rule in
 *     `endpoint-permissions.spec.ts` (phase 2 since docs/25 B2d) makes sure
 *     such a route is listed in `AUTHENTICATED_ONLY` with a reason.
 *  3. Metadata present, `req.user.permissions` missing → 403, fail closed.
 *     The set is NEVER recomputed from the role here: it is built once in
 *     `JwtAccessStrategy.validate`, and that is where B6 overrides land.
 *  4. Otherwise allow iff any required permission is in the set. An empty
 *     requirement (not writable with the typed decorator) admits nobody.
 *
 * 403 messages are byte-identical to RolesGuard's, so swapping `@Roles` for
 * `@RequirePermission` on a route (B2a–c) keeps its error responses unchanged.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;

    const declared = this.reflector.getAllAndOverride<unknown>(PERMISSIONS_METADATA_KEY, targets);
    // Decorator-driven: no metadata → no opinion (session-only, see 2. above).
    if (declared === undefined || declared === null) return true;
    const required: unknown[] = Array.isArray(declared) ? declared : [];

    const user = context.switchToHttp().getRequest<{ user?: unknown }>().user;
    const granted = grantedPermissions(user);
    if (!granted) {
      // A non-public route reached without a JwtAccessStrategy user: a bug
      // (or no JwtAuthGuard in front). Surface it, never fall back to `role`.
      this.logger.warn({
        msg: 'PermissionsGuard: request user carries no permission set — denied (fail closed)',
        handler: `${context.getClass().name}.${context.getHandler().name}`,
        hasUser: user !== undefined && user !== null,
      });
      throw new ForbiddenException(FORBIDDEN_NO_USER_MESSAGE);
    }
    // `has` on a ReadonlySet<Permission> accepts only a Permission; metadata is
    // read as unknown[], and a non-catalog value simply never matches.
    const held: ReadonlySet<unknown> = granted;
    if (required.some((p) => held.has(p))) return true;
    throw new ForbiddenException(FORBIDDEN_NOT_GRANTED_MESSAGE);
  }
}
