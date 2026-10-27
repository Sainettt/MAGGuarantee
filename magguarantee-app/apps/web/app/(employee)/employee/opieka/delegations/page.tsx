// `/employee/opieka/delegations` — the opiekun's all-carriers "Wyjazdy" list.
//
// Deliberately NOT `/employee/delegations`: that path is admin-only (it sits
// under the `(admin)` route group and is listed in
// `SCOPE_RESTRICTED_EMPLOYEE_PREFIXES`, so an opiekun is bounced at the edge).
//
// UWAGI #17 — the page gates itself server-side with `delegations.read`, the
// permission of its nav entry (`opieka-delegations`); denied → the shell's
// «Brak dostępu» page. At the edge this sub-path falls under the
// `/employee/opieka` rule (`panel.opiekun`, `PATH_PERMISSIONS` in
// `lib/roles.ts`), so a pracownik is bounced before he gets here. That is why
// the gate lives in this page and not in a shared `opieka/layout.tsx`: the
// rule here differs from the rest of `/employee/opieka/*`.
//
// Scope comes from the server: `GET /delegations` narrows to the carriers whose
// `opiekunId` is the caller — no `carrierId` filter is sent from the client.
//
// Strictly read-only (docs/03-roles.md#opiekun — nadzór, no status transitions).
// The page delegates to a client view because it owns filter + cursor state.

import { requirePermission } from '@/lib/auth/server';

import { OpiekunDelegationsView } from './OpiekunDelegationsView';

export const dynamic = 'force-dynamic';

export default async function OpiekaDelegationsPage() {
  await requirePermission('delegations.read', { onDenied: 'forbidden' });
  return <OpiekunDelegationsView />;
}
