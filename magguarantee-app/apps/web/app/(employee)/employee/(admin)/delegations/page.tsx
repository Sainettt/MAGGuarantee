// Phase 6.x — `/employee/delegations` (admin). The `(admin)` route-group
// layout gates non-admins server-side; the page delegates to the client view
// because it owns interactive filter + cursor-pagination state.

import { DelegationsView } from './DelegationsView';

export const dynamic = 'force-dynamic';

export default function DelegationsPage() {
  return <DelegationsView />;
}
