// Auth gate. Public routes (`/login`, `/login/verify`) skip the check;
// everything else requires the `mt_access` cookie. Static assets are excluded
// via the `matcher` below.
//
// i18n note: locale is resolved server-side in `i18n/request.ts` from the
// `mt_lang` cookie / `Accept-Language` header. We don't run next-intl's
// middleware because we don't use URL-prefixed locales.

import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'mt_access';

const PUBLIC_PATHS = new Set<string>(['/login', '/login/verify']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // allow nested public assets / shells in case we add `/login/*` flows later
  return pathname.startsWith('/login/');
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

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, static assets and favicon. Everything else passes
  // through this middleware.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)'],
};
