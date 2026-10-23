// docs/14 §17.5 — `/planista/przekazania` «Moje wnioski»: the planista's own
// transfer requests (author mode) + the «Przekaż ciągnik» CTA (the dialog's
// second entry — he picks one of his active vehicles).
//
// The `(planista)` layout already gates the shell to planista + admin. An
// admin's own requests (he files from the vehicle edit form — docs/14 D9) and
// his decisions both live in `/employee/przekazania` (tabs «Do decyzji» /
// «Rozpatrzone» / «Moje wnioski», §17.5.8), so a direct admin visit goes there
// (W7) instead of a second, partial list.

import { redirect } from 'next/navigation';

import { getServerUser } from '@/lib/auth/server';

import { PlanistaMyTransfersView } from './PlanistaMyTransfersView';

export const dynamic = 'force-dynamic';

export default async function PlanistaMyTransfersPage() {
  const user = await getServerUser();
  if (user?.role === 'admin') redirect('/employee/przekazania');
  return <PlanistaMyTransfersView />;
}
