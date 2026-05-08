// Auth + role gate. Public routes (`/login`, `/login/verify`) skip the check;
// everything else requires the `mt_access` cookie AND a path that is allowed
// for the caller's role. Static assets are excluded via the `matcher` below.
//
// Role enforcement: the JWT body is base64-decoded (no signature check —
// that's the API's job) to read the `role` claim. We then consult the
// allow-list in `lib/roles.ts` (`isAllowedForRole`). Mismatched paths are
// redirected to the role's landing instead of returning 403; this avoids
// flashing forbidden shells and gives the user a useful destination.
//
// The middleware is the FIRST line of defense — fast, no API round-trip. Each
// route-group layout re-checks server-side via `requireRoleAccess()` against
// `/auth/me` (defense in depth: catches forged JWTs that lie about `role`,
// since that check uses the API as source of truth). Real entity-scope
// authorization (e.g. "carrier can only see own claims") lives at the API
// layer (`@Roles`, `CarrierScopeGuard`).
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

function readRoleFromJwt(token: string): Role | null {
  // JWT = header.payload.signature. We only need the payload's `role` claim
  // for routing — signature verification is the API's job, not ours.
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const raw = parts[1];
  if (!raw) return null;
  try {
    const payload = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded);
    const data = JSON.parse(json) as { role?: unknown };
    if (typeof data.role !== 'string') return null;
    return KNOWN_ROLES.has(data.role as Role) ? (data.role as Role) : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  // Always allow public routes — even if the user is already authenticated
  // (the page itself can redirect them to their landing if it wants).
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!access) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/' && pathname !== '/login') {
      url.searchParams.set('next', pathname + search);
    }
    return NextResponse.redirect(url);
  }

  // Root `/` is always allowed — `app/page.tsx` resolves the landing for the
  // current user via /auth/me and redirects there. Letting it through avoids
  // duplicating the landing logic at the edge.
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Role-based gating. We decode the JWT body (not verify) to read the role
  // claim. Pathological values (malformed token, missing role, unknown role)
  // bounce to /login — safer to under-permission than to assume a default.
  const role = readRoleFromJwt(access);
  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // If the path is owned by some role group and this user isn't allowed,
  // redirect them to their own landing. Unmapped paths (404 candidates) we
  // pass through — Next will render its 404 inside the matched layout, and
  // since the user has SOME valid role, their landing is one click away.
  if (isGatedPath(pathname) && !isAllowedForRole(pathname, role)) {
    const url = req.nextUrl.clone();
    url.pathname = landingFor(role);
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, static assets and favicon. Everything else passes
  // through this middleware.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)'],
};
