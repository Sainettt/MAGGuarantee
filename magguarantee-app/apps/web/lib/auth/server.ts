// Server-side auth helper — fetch the current `UserDto` by forwarding the
// caller's cookies to the API. Used by Server Components that need to gate
// rendering by role *before* shipping anything to the client (so a typed-URL
// `/employee/carriers` from a `pracownik` is redirected at the server, not
// hidden client-side).
//
// JWT verification happened in middleware / on the API; we only need the
// role here, and the API is the source of truth for it. We deliberately do
// NOT decode the JWT body locally — round-tripping to `/auth/me` keeps the
// access-token format opaque and revocation works (a logged-out token won't
// resolve to a user).

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role, UserDto } from '@magguarantee/shared';

import { landingFor } from '../roles';
import {
  ACCESS_COOKIE,
  AUTH_UNAVAILABLE_HEADER,
  REFRESH_COOKIE,
} from './constants';

const SERVER_API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

// `AUTH_UNAVAILABLE_HEADER` is only honoured together with a refresh cookie
// (and the middleware strips client-supplied copies), so forging it can at
// worst show the forger an error page instead of /login.

/**
 * Thrown when the API can't tell us who the caller is — unreachable, 5xx,
 * throttled. Deliberately NOT mapped to `null`: that used to redirect to
 * /login and made every API outage look like a logout. The nearest
 * `error.tsx` renders "service unavailable" + retry instead.
 */
export class AuthServiceUnavailableError extends Error {
  constructor(reason: string) {
    super(`Auth service unavailable: ${reason}`);
    this.name = 'AuthServiceUnavailableError';
  }
}

/** Structured server log line — never includes cookies, tokens or user data. */
function logAuthFailure(event: string, fields: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      level: 'error',
      scope: 'web.auth.server',
      event,
      ...fields,
    }),
  );
}

/**
 * Returns the current authenticated user, or `null` if the caller is
 * anonymous / their session is no longer valid (API answered 401).
 *
 * Throws `AuthServiceUnavailableError` when the API could not answer (network
 * error, 5xx, 429, unexpected status) — callers must not treat an outage as
 * "anonymous". `redirect()` is never swallowed (it's outside the try).
 */
export async function getServerUser(): Promise<UserDto | null> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  if (!access) {
    // The middleware couldn't reach /auth/refresh, so it never obtained a
    // fresh access token. The refresh cookie may still be valid — don't send
    // the user to /login for an outage.
    const h = await headers();
    if (h.get(AUTH_UNAVAILABLE_HEADER) && store.get(REFRESH_COOKIE)) {
      logAuthFailure('auth.me.skipped_refresh_unreachable', {});
      throw new AuthServiceUnavailableError('refresh-unreachable');
    }
    return null;
  }

  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let res: Response;
  try {
    res = await fetch(`${SERVER_API_URL}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader, accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    logAuthFailure('auth.me.network_error', {
      error: err instanceof Error ? err.name : typeof err,
      cause:
        err instanceof Error && err.cause instanceof Error
          ? err.cause.name
          : undefined,
    });
    throw new AuthServiceUnavailableError('network');
  }

  // 401 is the API's "no valid session" answer (inactive user, revoked or
  // expired token, password changed) — the only status that means anonymous.
  if (res.status === 401) return null;

  if (!res.ok) {
    logAuthFailure('auth.me.unexpected_status', { status: res.status });
    throw new AuthServiceUnavailableError(`status-${res.status}`);
  }

  try {
    return (await res.json()) as UserDto;
  } catch (err) {
    logAuthFailure('auth.me.invalid_body', {
      status: res.status,
      error: err instanceof Error ? err.name : typeof err,
    });
    throw new AuthServiceUnavailableError('invalid-body');
  }
}

/**
 * Reads the current request's path (via the Next.js `x-invoke-path` /
 * `next-url` headers, with `referer` as a last-resort fallback) so that a
 * server-side `redirect('/login')` can forward it as `?next=...`. Returns
 * `null` when the path cannot be determined or isn't safe to forward
 * (avoids open-redirect via attacker-controlled `referer`).
 *
 * Why this matters: when an access-token expires mid-session and
 * `requireRoleAccess()` bounces the user to `/login`, we want the post-login
 * flow to drop them back where they were — not on the role's default
 * landing. Edge middleware already does this for cookie-less requests; here
 * we do the equivalent for the "cookie present but stale" case.
 */
async function currentPathForNextParam(): Promise<string | null> {
  const h = await headers();
  // Next.js sets one of these on every server-component invocation.
  const fromInvoke = h.get('x-invoke-path');
  const fromNextUrl = h.get('next-url');
  let path = fromInvoke ?? fromNextUrl ?? null;

  // Last resort: parse the `referer` URL. Reject cross-origin referers so we
  // don't trust attacker-controlled values for the `next` redirect.
  if (!path) {
    const referer = h.get('referer');
    const host = h.get('host');
    if (referer && host) {
      try {
        const url = new URL(referer);
        if (url.host === host) {
          path = url.pathname + url.search;
        }
      } catch {
        // ignore malformed referer
      }
    }
  }

  if (!path || !path.startsWith('/')) return null;
  // Don't echo back the login pages — they'd cause a self-redirect on
  // success.
  if (path === '/login' || path.startsWith('/login/')) return null;
  // Cap to keep cookies / URLs sane (mirrors safeNextPath's MAX_NEXT_LEN).
  if (path.length > 512) return null;
  return path;
}

/**
 * Server-side role gate. Used inside route-group layouts as defense in depth
 * after the edge middleware. Behavior:
 *  - API unreachable / failing → `AuthServiceUnavailableError` propagates to
 *    the nearest error boundary (`app/error.tsx` for layouts)
 *  - anonymous → redirect to /login?next=<current-path>
 *  - role not in `allowed` → redirect to that role's own landing
 *  - otherwise → return the user for downstream use
 *
 * The redirect-on-mismatch (rather than 403) mirrors middleware so the user
 * lands somewhere usable instead of staring at a forbidden screen. The
 * `?next=` forward on the anonymous branch matches edge-middleware behaviour
 * so re-login lands the user back on the page they wanted.
 */
export async function requireRoleAccess(
  allowed: readonly Role[],
): Promise<UserDto> {
  const user = await getServerUser();
  if (!user) {
    const next = await currentPathForNextParam();
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  }
  if (!allowed.includes(user.role)) redirect(landingFor(user.role));
  return user;
}
