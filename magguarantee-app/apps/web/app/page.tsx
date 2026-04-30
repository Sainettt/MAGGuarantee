// Root `/` — for authenticated users, redirect to their role landing; for
// anonymous, the middleware already shipped them to /login before this
// component ever rendered. We do a server-side fetch to /auth/me with the
// caller's cookies so we can pick the right landing without a client flicker.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { landingFor } from '@/lib/roles';
import type { UserDto } from '@magguarantee/shared';

export const dynamic = 'force-dynamic';

const SERVER_API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default async function HomePage() {
  const store = await cookies();
  const access = store.get('mt_access')?.value;
  if (!access) redirect('/login');

  // Forward the cookie so the API can identify us. We use the Cookie header
  // rather than `credentials: 'include'` because that flag is meaningless in
  // server-side fetch.
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let user: UserDto | null = null;
  try {
    const res = await fetch(`${SERVER_API_URL}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader, accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      user = (await res.json()) as UserDto;
    }
  } catch {
    // Network failure — fall through to /login.
  }

  if (!user) redirect('/login');
  redirect(landingFor(user.role));
}
