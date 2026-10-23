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
  AUTHENTICATED_ONLY_KEY,
  FORBIDDEN_NO_USER_MESSAGE,
  FORBIDDEN_NOT_GRANTED_MESSAGE,
  IS_PUBLIC_KEY,
  PERMISSIONS_METADATA_KEY,
} from '../auth.constants';

/**
 * The authorization gate of every route (docs/25 §3 B2, B5; docs/15 §Roles &
 * Guards). Reads `@Public` / `@AuthenticatedOnly` / `@RequirePermission` and
 * DENIES BY DEFAULT.
 *
 * Global `APP_GUARD` (app.module.ts: Throttler → JwtAuth → Permissions;
 * controller `@UseGuards`, e.g. the ownership guards, run after it). Metadata
 * is resolved with `getAllAndOverride([handler, class])` — the handler wins.
 * In this order:
 *  1. `@Public` (same `IS_PUBLIC_KEY` lookup as `JwtAuthGuard`) → allow. On
 *     `POST /auth/refresh` `req.user` is the refresh-token payload, which has
 *     no `permissions`.
 *  2. `@AuthenticatedOnly(reason)` → allow iff `req.user` exists: any session,
 *     whatever its permissions. No user → 403.
 *  3. `@RequirePermission(...)` → allow iff `req.user.permissions` holds at
 *     least one of them (any-of). A missing set → 403, fail closed: it is
 *     NEVER recomputed from the role here — it is built once in
 *     `JwtAccessStrategy.validate`, and that is where B6 overrides land. An
 *     empty requirement (not writable with the typed decorator) admits nobody.
 *  4. Nothing declared → 403 + a warn naming the handler. A route without an
 *     authorization decision is a bug, never "any session"; the inverse rule
 *     in `common/authz/endpoint-permissions.spec.ts` turns it red in CI.
 *
 * Contradictory pairs (`@Public` or `@AuthenticatedOnly` next to
 * `@RequirePermission`) resolve by this order; they are red in the snapshot
 * specs, not handled here. 403 bodies: `FORBIDDEN_*_MESSAGE` (auth.constants.ts).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;

    const user = context.switchToHttp().getRequest<{ user?: unknown }>().user;
    const sessionOnly = this.reflector.getAllAndOverride<unknown>(AUTHENTICATED_ONLY_KEY, targets);
    if (isDeclared(sessionOnly)) return this.allowSession(context, user);

    const required = this.reflector.getAllAndOverride<unknown>(PERMISSIONS_METADATA_KEY, targets);
    if (isDeclared(required)) return this.allowAnyOf(context, user, required);

    this.logger.warn({
      msg: 'PermissionsGuard: route declares no @Public, @AuthenticatedOnly or @RequirePermission — denied (deny by default)',
      handler: handlerName(context),
    });
    throw new ForbiddenException(FORBIDDEN_NO_USER_MESSAGE);
  }

  /** `@AuthenticatedOnly`: any request user passes; the reason is for reviewers. */
  private allowSession(context: ExecutionContext, user: unknown): boolean {
    if (typeof user === 'object' && user !== null) return true;
    // A non-public route reached without a user: a bug (or no JwtAuthGuard in front).
    this.logger.warn({
      msg: 'PermissionsGuard: session-only route reached without a request user — denied',
      handler: handlerName(context),
    });
    throw new ForbiddenException(FORBIDDEN_NO_USER_MESSAGE);
  }

  /** `@RequirePermission`: any-of against the set JwtAccessStrategy built. */
  private allowAnyOf(context: ExecutionContext, user: unknown, declared: unknown): boolean {
    const required: unknown[] = Array.isArray(declared) ? declared : [];
    const granted = grantedPermissions(user);
    if (!granted) {
      // A non-public route reached without a JwtAccessStrategy user: a bug
      // (or no JwtAuthGuard in front). Surface it, never fall back to `role`.
      this.logger.warn({
        msg: 'PermissionsGuard: request user carries no permission set — denied (fail closed)',
        handler: handlerName(context),
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

function isDeclared(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** `Controller.handler` — the route identity in logs (no request data). */
function handlerName(context: ExecutionContext): string {
  return `${context.getClass().name}.${context.getHandler().name}`;
}
