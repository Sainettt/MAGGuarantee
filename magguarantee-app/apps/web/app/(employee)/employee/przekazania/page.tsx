// docs/14 §17.4.1 / §17.5 — `/employee/przekazania` «Przekazania ciągników».
//
//   admin   → decider: every request (approve / reject), nav pill = pending
//             he can decide (his own excluded); plus the third tab «Moje
//             wnioski» — the requests HE filed (`scope=mine`, §17.5.8). He
//             files from the vehicle edit form (E2, D9), so no CTA here;
//   opiekun → author: his own requests (D5 — no pill; he files from the
//             vehicle edit form, so the list has no CTA).
//
// NOT admin-only (the opiekun reaches it), but not for `pracownik` either: he
// has no part in vehicle transfers and the api would 403 both scopes. The
// edge middleware bounces him already (`PATH_PERMISSIONS` in lib/roles.ts);
// this server check is the defense-in-depth twin, landing on the shell's
// «Brak dostępu» page like the `(admin)` segment does.

import { requirePermission } from '@/lib/auth/server';

import { TransfersView } from './TransfersView';

export const dynamic = 'force-dynamic';

export default async function EmployeeTransfersPage() {
  const user = await requirePermission(
    ['vehicles.planner_transfer.request', 'vehicles.planner_transfer.decide'],
    { onDenied: 'forbidden' },
  );
  // scope: which LIST the employee shell shows, not a right — the admin's
  // inbox spans every request (decider), the opiekun's holds his own (author).
  // Who may decide a given row is the api's per-row `viewerCanDecide`.
  return <TransfersView mode={user.role === 'admin' ? 'decider' : 'author'} />;
}
