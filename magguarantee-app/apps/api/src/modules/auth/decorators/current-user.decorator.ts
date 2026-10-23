import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Permission, Role } from '@magguarantee/shared';

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
  // Forced change-password gate (docs/15-auth-strategy.md). When true the
  // user has a valid session but must set a new password. DB-sourced — see
  // JwtAccessStrategy.validate.
  mustChangePassword: boolean;
  // Phase 11 — the dispatch team this user belongs to (role=dyspozytor only;
  // null for every other role / an unassigned dyspozytor). Resolved from the DB
  // in JwtAccessStrategy.validate (like mustChangePassword), NOT carried in the
  // JWT payload. A dyspozytor with teamId null/undefined sees an EMPTY
  // fleet/km/delegation scope (explicit empty set, never "all").
  //
  // Optional on the type (test fixtures / non-strategy callers may omit it);
  // the strategy ALWAYS sets it. Scope code treats `undefined` and `null`
  // identically — both mean "no team" → empty set.
  teamId?: string | null;
  // Leader flag over `role` (docs/28 §1). DB-sourced in
  // JwtAccessStrategy.validate like `teamId` — NOT a JWT claim. Scope branches
  // still key on `role` alone; the permissions layer reads `(role, lider)` via
  // `permissions` below.
  //
  // Optional on the type so the existing `AuthUser` fixtures stay valid; the
  // strategy ALWAYS sets it. `undefined` means "not a leader".
  lider?: boolean;
  // Effective permissions of this request (docs/25 §3 B2). Computed ONCE in
  // JwtAccessStrategy.validate from `permissionsFor(role, lider)` — the same
  // DB-sourced pair as above — and read by PermissionsGuard and `can()`
  // (common/authz/can.ts). B6 adds per-user overrides at that single point.
  //
  // Required on purpose: a user object without it would make every
  // `@RequirePermission` route answer 403 (the guard fails closed and never
  // recomputes from the role). Tests build users with
  // `common/testing/make-auth-user.ts#makeAuthUser`.
  permissions: ReadonlySet<Permission>;
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
