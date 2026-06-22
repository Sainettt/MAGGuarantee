// Phase 7.10 — `/weryfikator/delegations`. The weryfikator's delegation-status
// board (docs/14 §7.10), the SECOND of the role's two screens. The
// `(weryfikator)` route-group layout gates non-weryfikator (admin debug-
// fallback) server-side + wraps in <RoleShell>; this page renders the shared
// two-tab nav + the client view, which owns the filter + status-transition
// dialog state.

import { WeryfikatorDelegationsView } from './WeryfikatorDelegationsView';
import { WeryfikatorTabsNav } from '../WeryfikatorTabsNav';

export const dynamic = 'force-dynamic';

export default function WeryfikatorDelegationsPage() {
  return (
    <>
      <WeryfikatorTabsNav />
      <WeryfikatorDelegationsView />
    </>
  );
}
