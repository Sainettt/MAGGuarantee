import { SetMetadata } from '@nestjs/common';

import { AUTHENTICATED_ONLY_KEY } from '../auth.constants';

/**
 * Shortest `@AuthenticatedOnly` reason the inverse rule accepts
 * (`common/authz/endpoint-permissions.spec.ts`): long enough that it has to
 * say WHY any session may call the route, not just "public-ish".
 */
export const AUTHENTICATED_ONLY_MIN_REASON_LENGTH = 20;

/**
 * Opens a route (or a whole controller) to every authenticated user, whatever
 * their permissions — the explicit "session-only" decision of docs/25 B5.
 *
 * `PermissionsGuard` denies by default: a non-`@Public` route passes only with
 * `@RequirePermission(...)` (any-of) or with this decorator. `reason` says why
 * no permission gates the route (e.g. "every signed-in user reads their own
 * session profile"); it is metadata for reviewers and the inverse rule, which
 * requires at least {@link AUTHENTICATED_ONLY_MIN_REASON_LENGTH} characters.
 * The guard only checks that `req.user` exists (set by the global
 * `JwtAuthGuard`).
 *
 * Prefer a catalog permission: this is for routes every role must reach
 * (own session, forced password change, shared dictionaries). `@Public` and
 * `@RequirePermission` next to it are contradictions (red in
 * `roles-snapshot.spec.ts` / `endpoint-permissions.spec.ts`), never resolved
 * at runtime.
 */
export const AuthenticatedOnly = (reason: string): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ONLY_KEY, reason);
