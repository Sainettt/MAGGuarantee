// Root `/` — for authenticated users, redirect to their role landing; for
// anonymous, the middleware already shipped them to /login before this
// component ever rendered. We do a server-side fetch to /auth/me with the
// caller's cookies so we can pick the right landing without a client flicker.

import { redirect } from 'next/navigation';

import { getServerUser } from '@/lib/auth/server';
import { landingFor } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  redirect(landingFor(user.role));
}
