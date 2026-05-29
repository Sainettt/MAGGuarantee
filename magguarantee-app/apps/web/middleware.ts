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

import { NextResponse, type NextRequest } from 'next/server';
import type { Role } from '@magguarantee/shared';

import {
  isAllowedForRole,
  isGatedPath,
  landingFor,
} from './lib/roles';

const ACCESS_COOKIE = 'mt_access';
const REFRESH_COOKIE = 'mt_refresh';

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

  const needRefresh = !access || isAccessExpired(access);
  if (needRefresh) {
    // No refresh token → nothing to refresh with; behave exactly like the
    // legacy "no access" branch.
    if (!refresh) {
      return loginRedirect(req);
    }

    try {
      const apiRes = await fetch(REFRESH_URL, {
        method: 'POST',
        headers: { cookie: `${REFRESH_COOKIE}=${refresh}` },
      });

      if (!apiRes.ok) {
        // Refresh failed → the server already invalidated the session (or a
        // rare cross-tab rotation race lost). Redirect to login; do not retry.
        return loginRedirect(req);
      }

      refreshedSetCookies = apiRes.headers.getSetCookie();
      const newAccess = refreshedSetCookies
        .map((sc) => readCookieValueFromSetCookie(sc, ACCESS_COOKIE))
        .find((v): v is string => v !== null);

      if (!newAccess) {
        // Refresh succeeded but didn't return a new access cookie — we can't
        // proceed with stale/absent access. Safest is to bounce to login.
        return loginRedirect(req);
      }

      // (a) use the fresh token for role-gating below.
      access = newAccess;
    } catch {
      // Network / thrown error → treat as failed refresh.
      return loginRedirect(req);
    }
  }

  // After a (possible) refresh `access` is guaranteed to be set if we reached
  // here. TS doesn't know that, so guard explicitly.
  if (!access) {
    return loginRedirect(req);
  }

  // Build the response. When we refreshed, rewrite the in-request `cookie`
  // header so this SAME request's downstream Server Components (`getServerUser`
  // → `/auth/me`) read the fresh access token, and append the API's raw
  // Set-Cookie strings verbatim so the browser persists the rotated pair.
  const makeResponse = (): NextResponse => {
    if (refreshedSetCookies.length === 0) {
      return NextResponse.next();
    }

    const newRequestHeaders = new Headers(req.headers);
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
    const url = req.nextUrl.clone();
    url.pathname = landingFor(role);
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
