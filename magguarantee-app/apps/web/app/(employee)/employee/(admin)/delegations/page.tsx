// Phase 6.x — `/employee/delegations` (admin). The `(admin)` route-group
// layout gates the segment server-side; the page delegates to the client view
// because it owns interactive filter + cursor-pagination state.

import { redirect } from 'next/navigation';

import { EMPLOYEE_FORBIDDEN_PATH, requirePermission } from '@/lib/auth/server';

import { DelegationsView } from './DelegationsView';

export const dynamic = 'force-dynamic';

export default async function DelegationsPage() {
  const user = await requirePermission('delegations.read', {
    onDenied: 'forbidden',
  });
  // scope: the unscoped all-carriers «Wyjazdy» is the admin's view. The
  // opiekun holds `delegations.read` too, but reads his own carriers at
  // `/employee/opieka/delegations`; pracownik must never reach delegacje
  // (docs/19-known-quirks.md #13). Same target the `(admin)` layout had.
  if (user.role !== 'admin') redirect(EMPLOYEE_FORBIDDEN_PATH);
  return <DelegationsView />;
}
