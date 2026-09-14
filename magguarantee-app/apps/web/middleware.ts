// Auth + role gate. Public routes (`/login`, `/login/verify`) skip the check;
// everything else requires a *usable* access token AND a path that is allowed
// for the caller's role. Static assets are excluded via the `matcher` below.
//
// Silent refresh: the API sets `mt_access` with a 15-min maxAge, so the browser
// drops it after 15 min even though `mt_refresh` is valid for 30 days. On a
// hard navigation (typed URL, full reload, server-rendered route) there's no
// XHR interceptor to catch the resulting 401 — so the middleware does the
// equivalent here: if `mt_access` is missing or expired but a `mt_refresh`
// cookie is present, it calls `POST /auth/refresh` server-to-server, forwards
// the API's rotated Set-Cookie headers to the browser, and rewrites the
// in-request `cookie` header so this same request's downstream Server
// Components (`getServerUser` → `/auth/me`) see the fresh access token. This
// mirrors the client `fetchWithRefresh` 401→refresh→retry contract for
// document navigations.
//
// Role enforcement: the JWT body is base64-decoded (no signature check —
// that's the API's job) to read the `role` claim. We then consult the
// allow-list in `lib/roles.ts` (`isAllowedForRole`). Mismatched paths are
// redirected to the role's landing instead of returning 403; this avoids
// flashing forbidden shells and gives the user a useful destination.
//
// The middleware is the FIRST line of defense — fast, single refresh round-trip
// only when needed. Each route-group layout re-checks server-side via
// `requireRoleAccess()` against `/auth/me` (defense in depth: catches forged
// JWTs that lie about `role`, since that check uses the API as source of
// truth). Real entity-scope authorization (e.g. "carrier can only see own
// claims") lives at the API layer (`@Roles`, `CarrierScopeGuard`).
//
// i18n note: locale is resolved server-side in `i18n/request.ts` from the
// `mt_lang` cookie / `Accept-Language` header. We don't run next-intl's
// middleware because we don't use URL-prefixed locales.
//
// Observability: every non-happy auth branch (refresh unreachable / rejected /
// no access cookie returned, unreadable role, role-mismatch redirect) emits ONE
// structured JSON line via `logAuthEvent`. Lines carry the pathname, statuses
// and error NAMES only — never cookies, tokens, query strings or user ids.
//
// API unreachable ≠ logout: when the refresh call fails at the NETWORK level
// (API container down / restarting) the session may be perfectly valid, so we
// do NOT redirect to /login. The request passes through flagged with
// `AUTH_UNAVAILABLE_HEADER`; the route-group layout's `requireRoleAccess()`
// then throws `AuthServiceUnavailableError` and `app/error.tsx` renders
// "service unavailable" + retry. A REJECTED refresh (non-2xx) still redirects
// to /login exactly as before — see the race-heal note in that branch.

import { NextResponse, type NextRequest } from 'next/server';
import type { Role } from '@magguarantee/shared';

import {
  ACCESS_COOKIE,
  AUTH_UNAVAILABLE_HEADER,
  REFRESH_COOKIE,
} from './lib/auth/constants';
import {
  isAllowedForRole,
  isGatedPath,
  landingFor,
} from './lib/roles';

type AuthLogLevel = 'info' | 'warn';

/** One structured line per auth event (edge runtime → stdout of the web container). */
function logAuthEvent(
  level: AuthLogLevel,
  event: string,
  req: NextRequest,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  const line = JSON.stringify({
    level,
    scope: 'web.middleware',
    event,
    // Pathname only: query strings can carry reset codes / `next=` targets.
    path: req.nextUrl.pathname,
    ...fields,
  });
  if (level === 'warn') console.warn(line);
  else console.info(line);
}

function errorName(err: unknown): string {
  if (err instanceof Error) {
    // Node/undici wraps the real reason (ECONNREFUSED, ENOTFOUND…) in `cause`.
    const cause = err.cause as { code?: unknown } | undefined;
    const code = typeof cause?.code === 'string' ? `:${cause.code}` : '';
    return `${err.name}${code}`;
  }
  return typeof err;
}

// Server-side API base. Middleware runs server-side, so non-public env vars
// are available here. Same precedence as `lib/auth/server.ts`.
const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const REFRESH_URL = `${API_BASE}/api/v1/auth/refresh`;

// Treat the token as expired this many seconds before its real `exp` so we
// refresh proactively instead of racing the API's own clock on a borderline
// request.
const EXP_LEEWAY_SECONDS = 5;

const PUBLIC_PATHS = new Set<string>(['/login', '/login/verify']);

const KNOWN_ROLES: ReadonlySet<Role> = new Set([
  'admin',
  'pracownik',
  'opiekun',
  'planista',
  'dyspozytor',
  'przewoznik',
  'eksport',
  'weryfikator',
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // allow nested public assets / shells in case we add `/login/*` flows later
  return pathname.startsWith('/login/');
}

/**
 * Decodes a JWT payload (base64url) WITHOUT verifying the signature — that's
 * the API's job. Returns the parsed claims object, or null on any malformation.
 * Shared by `readRoleFromJwt` and `isAccessExpired`.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  // JWT = header.payload.signature. We only need the payload claims.
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const raw = parts[1];
  if (!raw) return null;
  try {
    const payload = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded);
    const data = JSON.parse(json) as unknown;
    if (typeof data !== 'object' || data === null) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readRoleFromJwt(token: string): Role | null {
  const data = decodeJwtPayload(token);
  if (!data) return null;
  if (typeof data.role !== 'string') return null;
  return KNOWN_ROLES.has(data.role as Role) ? (data.role as Role) : null;
}

/**
 * Phase 9 §9.3 — reads the `mustChangePassword` claim from the access token.
 * When true the user has a real session (2FA passed) but is gated to the
 * forced change-password screen until they set their own password. Decode
 * only — the API is the source of truth for the actual gate (defense in depth).
 */
function mustChangePasswordFromJwt(token: string): boolean {
  const data = decodeJwtPayload(token);
  return data?.mustChangePassword === true;
}

// The forced-change interstitial itself — must be reachable while the gate is
// set (otherwise the redirect would loop). Logout is posted to the API directly
// (no web route), so it needs no allowance here.
const CHANGE_PASSWORD_PATH = '/login/change-password';

/**
 * True when the access token's `exp` claim is absent or already past (with a
 * small leeway). Decode only — never verifies the signature. A malformed token
 * counts as expired so we attempt a refresh rather than trusting it.
 */
function isAccessExpired(token: string): boolean {
  const data = decodeJwtPayload(token);
  if (!data) return true;
  const exp = data.exp;
  if (typeof exp !== 'number') return true;
  return exp * 1000 <= Date.now() + EXP_LEEWAY_SECONDS * 1000;
}

/**
 * Extracts the `name=value` token from a single Set-Cookie string for the
 * given cookie name (ignoring attributes like Path/HttpOnly/Max-Age). Returns
 * the raw value, or null if this Set-Cookie isn't for `name`.
 */
function readCookieValueFromSetCookie(
  setCookie: string,
  name: string,
): string | null {
  // First segment is `name=value`; the rest (`; Path=/; HttpOnly; ...`) is
  // attributes we don't care about for the in-request forward.
  const firstSegment = setCookie.split(';', 1)[0]?.trim();
  if (!firstSegment) return null;
  const eq = firstSegment.indexOf('=');
  if (eq === -1) return null;
  const cookieName = firstSegment.slice(0, eq).trim();
  if (cookieName !== name) return null;
  return firstSegment.slice(eq + 1).trim();
}

/** Builds the `/login` redirect, forwarding `?next=` for non-root, non-login paths. */
function loginRedirect(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/' && pathname !== '/login') {
    url.searchParams.set('next', pathname + search);
  }
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Always allow public routes — even if the user is already authenticated
  // (the page itself can redirect them to their landing if it wants). This
  // early-return also guarantees redirects to `/login` never loop.
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;

  // Set-Cookie strings captured from a successful refresh. They must ride on
  // ANY response we ultimately return for this request (pass-through, rewrite,
  // OR a role-mismatch redirect) so the rotated tokens aren't lost.
  let refreshedSetCookies: string[] = [];

  // True when `/auth/refresh` could not be reached at all (network error).
  let refreshUnreachable = false;

  const needRefresh = !access || isAccessExpired(access);
  if (needRefresh) {
    // No refresh token → nothing to refresh with; behave exactly like the
    // legacy "no access" branch.
    if (!refresh) {
      // Plain anonymous traffic (no cookies at all) is not worth a log line;
      // an expired access token WITHOUT its refresh partner is.
      if (access) {
        logAuthEvent('info', 'auth.session.expired_without_refresh', req);
      }
      return loginRedirect(req);
    }

    try {
      // Forward the caller's identity so the API's per-IP throttle buckets and
      // the refresh-token audit columns (ipAddress / userAgent) see the real
      // client instead of the web container. Caddy sets x-forwarded-for in
      // prod; in dev it's absent and the API falls back to the socket peer.
      const refreshHeaders: Record<string, string> = {
        cookie: `${REFRESH_COOKIE}=${refresh}`,
      };
      const xff = req.headers.get('x-forwarded-for');
      if (xff) refreshHeaders['x-forwarded-for'] = xff;
      const ua = req.headers.get('user-agent');
      if (ua) refreshHeaders['user-agent'] = ua;

      const apiRes = await fetch(REFRESH_URL, {
        method: 'POST',
        headers: refreshHeaders,
      });

      if (!apiRes.ok) {
        // Refresh failed → the session is genuinely dead (revoked / expired /
        // account deactivated). Benign concurrent-rotation losers are healed
        // server-side with an access-only 200 (see AuthService.refresh), so a
        // non-ok here is NOT a race artifact. Redirect to login; do not retry.
        // 401/403 is the expected "session over" answer; anything else (429,
        // 5xx) is an API-side problem worth a warning.
        const expected = apiRes.status === 401 || apiRes.status === 403;
        logAuthEvent(
          expected ? 'info' : 'warn',
          'auth.refresh.rejected',
          req,
          { status: apiRes.status },
        );
        return loginRedirect(req);
      }

      refreshedSetCookies = apiRes.headers.getSetCookie();
      const newAccess = refreshedSetCookies
        .map((sc) => readCookieValueFromSetCookie(sc, ACCESS_COOKIE))
        .find((v): v is string => v !== null);

      if (!newAccess) {
        // Refresh succeeded but didn't return a new access cookie — we can't
        // proceed with stale/absent access. Safest is to bounce to login.
        logAuthEvent('warn', 'auth.refresh.no_access_cookie', req, {
          status: apiRes.status,
          setCookieCount: refreshedSetCookies.length,
        });
        return loginRedirect(req);
      }

      // (a) use the fresh token for role-gating below.
      access = newAccess;
    } catch (err) {
      // Network-level failure: no HTTP answer at all (API down / restarting /
      // DNS). We learned NOTHING about the session, so this must not look like
      // a logout. Fall through with the flag set: a still-present (expired)
      // access token keeps the role gating below working, and the layout's
      // `/auth/me` check turns the outage into the "service unavailable"
      // boundary instead of a /login bounce.
      logAuthEvent('warn', 'auth.refresh.network_error', req, {
        error: errorName(err),
        hadAccessCookie: Boolean(access),
      });
      refreshUnreachable = true;
    }
  }

  // Forward the request with rewritten headers when needed: rotated cookies
  // after a refresh, the auth-unavailable flag after an unreachable refresh,
  // and ALWAYS without a client-supplied copy of that flag.
  const needsHeaderRewrite =
    refreshedSetCookies.length > 0 ||
    refreshUnreachable ||
    req.headers.has(AUTH_UNAVAILABLE_HEADER);

  const buildRequestHeaders = (): Headers => {
    const h = new Headers(req.headers);
    h.delete(AUTH_UNAVAILABLE_HEADER);
    if (refreshUnreachable) h.set(AUTH_UNAVAILABLE_HEADER, '1');
    return h;
  };

  // After a (possible) refresh `access` is set unless there was no access
  // cookie AND the refresh could not run.
  if (!access) {
    if (refreshUnreachable) {
      // No token to read a role from — skip edge gating; the route-group
      // layout's server check (`requireRoleAccess`) sees the flag and throws
      // before any page renders.
      return NextResponse.next({ request: { headers: buildRequestHeaders() } });
    }
    return loginRedirect(req);
  }

  // Build the response. When we refreshed, rewrite the in-request `cookie`
  // header so this SAME request's downstream Server Components (`getServerUser`
  // → `/auth/me`) read the fresh access token, and append the API's raw
  // Set-Cookie strings verbatim so the browser persists the rotated pair.
  const makeResponse = (): NextResponse => {
    if (!needsHeaderRewrite) {
      return NextResponse.next();
    }
    if (refreshedSetCookies.length === 0) {
      return NextResponse.next({ request: { headers: buildRequestHeaders() } });
    }

    const newRequestHeaders = buildRequestHeaders();
    // Rebuild the `cookie` header with the rotated mt_access / mt_refresh
    // name=value pairs while preserving every other cookie unchanged.
    const updated = new Map<string, string>();
    for (const sc of refreshedSetCookies) {
      const accessVal = readCookieValueFromSetCookie(sc, ACCESS_COOKIE);
      if (accessVal !== null) updated.set(ACCESS_COOKIE, accessVal);
      const refreshVal = readCookieValueFromSetCookie(sc, REFRESH_COOKIE);
      if (refreshVal !== null) updated.set(REFRESH_COOKIE, refreshVal);
    }
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const c of req.cookies.getAll()) {
      const val = updated.get(c.name) ?? c.value;
      merged.push(`${c.name}=${val}`);
      seen.add(c.name);
    }
    for (const [name, val] of updated) {
      if (!seen.has(name)) merged.push(`${name}=${val}`);
    }
    newRequestHeaders.set('cookie', merged.join('; '));

    const res = NextResponse.next({ request: { headers: newRequestHeaders } });
    for (const sc of refreshedSetCookies) {
      res.headers.append('set-cookie', sc);
    }
    return res;
  };

  // Helper so role-mismatch / error redirects still carry the refreshed cookies.
  const withRefreshedCookies = (res: NextResponse): NextResponse => {
    for (const sc of refreshedSetCookies) {
      res.headers.append('set-cookie', sc);
    }
    return res;
  };

  // Phase 9 §9.3 — forced change-password gate. While the access token carries
  // `mustChangePassword`, the user is authenticated but may not reach ANY app
  // route (including `/`). Redirect every gated navigation to the interstitial.
  // `/login/change-password` itself is already allowed by `isPublic()` above,
  // so the redirect never loops. The gate clears when the user sets a password
  // (the API issues a fresh access token without the claim).
  if (mustChangePasswordFromJwt(access)) {
    const url = req.nextUrl.clone();
    url.pathname = CHANGE_PASSWORD_PATH;
    url.search = '';
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // Root `/` is always allowed — `app/page.tsx` resolves the landing for the
  // current user via /auth/me and redirects there. Letting it through avoids
  // duplicating the landing logic at the edge.
  if (pathname === '/') {
    return makeResponse();
  }

  // Role-based gating. We decode the JWT body (not verify) to read the role
  // claim. Pathological values (malformed token, missing role, unknown role)
  // bounce to /login — safer to under-permission than to assume a default.
  const role = readRoleFromJwt(access);
  if (!role) {
    logAuthEvent('warn', 'auth.role.unreadable', req, {
      refreshed: refreshedSetCookies.length > 0,
    });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // If the path is owned by some role group and this user isn't allowed,
  // redirect them to their own landing. Unmapped paths (404 candidates) we
  // pass through — Next will render its 404 inside the matched layout, and
  // since the user has SOME valid role, their landing is one click away.
  if (isGatedPath(pathname) && !isAllowedForRole(pathname, role)) {
    const target = landingFor(role);
    logAuthEvent('info', 'auth.role.mismatch_redirect', req, {
      role,
      target,
    });
    const url = req.nextUrl.clone();
    url.pathname = target;
    url.search = '';
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  return makeResponse();
}

export const config = {
  // Skip Next internals, static assets and favicon. Everything else passes
  // through this middleware.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)'],
};
