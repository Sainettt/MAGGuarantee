// Auth gate. Public routes (`/login`, `/login/verify`) skip the check;
// everything else requires the `mt_access` cookie. Static assets are excluded
// via the `matcher` below.
//
// Also enforces role-gating on admin-only employee pages. The JWT body is
// base64-decoded (no signature check — that's the API's job) just to read
// the `role` claim for the redirect decision. Real access control still lives
// at the API layer (`@Roles` decorators); middleware only spares pracownik
// the empty-page UX of hitting an admin-only screen.
//
// i18n note: locale is resolved server-side in `i18n/request.ts` from the
// `mt_lang` cookie / `Accept-Language` header. We don't run next-intl's
// middleware because we don't use URL-prefixed locales.

import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'mt_access';

const PUBLIC_PATHS = new Set<string>(['/login', '/login/verify']);

// Employee-shell sub-paths that only `admin` may reach. Other roles get
// redirected to `/employee` (the bare shell — Phase 3 has no employee landing
// content yet). See docs/03-roles.md#pracownik for the scope decision.
const ADMIN_ONLY_PREFIXES = [
  '/employee/carriers',
  '/employee/vehicles',
  '/employee/drivers',
  '/employee/trailers',
  '/employee/trailer-types',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // allow nested public assets / shells in case we add `/login/*` flows later
  return pathname.startsWith('/login/');
}

function isAdminOnly(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

function readRoleFromJwt(token: string): string | null {
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
    return typeof data.role === 'string' ? data.role : null;
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

  // Admin-only path gating. We decode the JWT body (not verify) to read the
  // role claim. If it's not 'admin', bounce to /employee. Anything pathological
  // (malformed token, missing role) also bounces — safer to under-permission.
  if (isAdminOnly(pathname)) {
    const role = readRoleFromJwt(access);
    if (role !== 'admin') {
      const url = req.nextUrl.clone();
      url.pathname = '/employee';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, static assets and favicon. Everything else passes
  // through this middleware.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)'],
};
