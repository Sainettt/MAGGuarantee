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

import { cookies } from 'next/headers';
import type { UserDto } from '@magguarantee/shared';

const SERVER_API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const ACCESS_COOKIE = 'mt_access';

/**
 * Returns the current authenticated user, or `null` if the caller is
 * anonymous / their token has expired. Never throws on auth failures —
 * network errors fall through to `null` so callers can `redirect('/login')`
 * uniformly.
 */
export async function getServerUser(): Promise<UserDto | null> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  if (!access) return null;

  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const res = await fetch(`${SERVER_API_URL}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as UserDto;
  } catch {
    return null;
  }
}
