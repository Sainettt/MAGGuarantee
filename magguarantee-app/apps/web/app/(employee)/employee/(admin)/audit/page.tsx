// Phase 4.5 — `/employee/audit` (admin). The `(admin)` route-group layout
// gates non-admins. We delegate the entire view to the client component
// because the page owns interactive filter state.

import { AuditView } from './AuditView';

export const dynamic = 'force-dynamic';

export default function AuditPage() {
  return <AuditView />;
}
