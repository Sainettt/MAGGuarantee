// Phase 7 — `/weryfikator/delegations`. The `(weryfikator)` route-group layout
// gates non-weryfikator (admin debug-fallback) server-side + wraps in
// <RoleShell>; this page delegates to the client view, which owns the filter +
// history-toggle + action-dialog state.

import { WeryfikatorDelegationsView } from './WeryfikatorDelegationsView';

export const dynamic = 'force-dynamic';

export default function WeryfikatorDelegationsPage() {
  return <WeryfikatorDelegationsView />;
}
