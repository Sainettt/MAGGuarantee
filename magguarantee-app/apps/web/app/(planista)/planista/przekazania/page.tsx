// docs/14 §17.5 — `/planista/przekazania` «Moje wnioski»: the planista's own
// transfer requests (author mode) + the «Przekaż ciągnik» CTA (the dialog's
// second entry — he picks one of his active vehicles).
//
// The `(planista)` layout already gates the shell to planista + admin. Admin
// never files a request (docs/29 U1) and decides in `/employee/przekazania`,
// so a direct admin visit goes there instead of an always-empty list.

import { redirect } from 'next/navigation';

import { getServerUser } from '@/lib/auth/server';

import { PlanistaMyTransfersView } from './PlanistaMyTransfersView';

export const dynamic = 'force-dynamic';

export default async function PlanistaMyTransfersPage() {
  const user = await getServerUser();
  if (user?.role === 'admin') redirect('/employee/przekazania');
  return <PlanistaMyTransfersView />;
}
