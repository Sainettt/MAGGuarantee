// `/employee/opieka/delegations` — the opiekun's all-carriers "Wyjazdy" list.
//
// Deliberately NOT `/employee/delegations`: that path is admin-only (it sits
// under the `(admin)` route group and is listed in
// `SCOPE_RESTRICTED_EMPLOYEE_PREFIXES`, so an opiekun is bounced at the edge). This
// route lives under `/employee/opieka/*`, which the shared `(employee)` layout
// already gates to admin/pracownik/opiekun; pracownik has no nav entry here and
// the API returns 403 for them.
//
// Scope comes from the server: `GET /delegations` narrows to the carriers whose
// `opiekunId` is the caller — no `carrierId` filter is sent from the client.
//
// Strictly read-only (docs/03-roles.md#opiekun — nadzór, no status transitions).
// The page delegates to a client view because it owns filter + cursor state.

import { OpiekunDelegationsView } from './OpiekunDelegationsView';

export const dynamic = 'force-dynamic';

export default function OpiekaDelegationsPage() {
  return <OpiekunDelegationsView />;
}
