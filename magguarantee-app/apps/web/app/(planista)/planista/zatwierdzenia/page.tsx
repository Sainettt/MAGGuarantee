// docs/14 §17.5 — `/planista/zatwierdzenia` «Do zatwierdzenia»: the transfer
// requests of this lider's planisci (decider mode).
//
// Who is a lider is NOT known at the edge (the middleware reads only the JWT
// role and must not import shared — docs/28 §9.2 #18), so the route is open to
// every planista and the view decides on the client: a non-lider gets the
// informational «Sekcja dla liderów planistów» state WITHOUT an API call.
// Admin decides in `/employee/przekazania` (all requests) — redirected there.

import { redirect } from 'next/navigation';

import { getServerUser } from '@/lib/auth/server';

import { PlanistaApprovalsView } from './PlanistaApprovalsView';

export const dynamic = 'force-dynamic';

export default async function PlanistaApprovalsPage() {
  const user = await getServerUser();
  if (user?.role === 'admin') redirect('/employee/przekazania');
  return <PlanistaApprovalsView />;
}
