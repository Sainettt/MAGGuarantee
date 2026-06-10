// Phase 7 — `/eksport/delegations`. The `(eksport)` route-group layout gates
// non-eksport (admin debug-fallback) server-side + wraps in <RoleShell>; this
// page delegates to the client view, which owns the filter + history-toggle
// state.

import { EksportDelegationsView } from './EksportDelegationsView';

export const dynamic = 'force-dynamic';

export default function EksportDelegationsPage() {
  return <EksportDelegationsView />;
}
