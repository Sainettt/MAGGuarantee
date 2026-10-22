// Phase 4 — `/employee/claims`. admin + pracownik only (no extra `(admin)`
// segment needed — pracownik is the primary target). The page is a thin
// server-component shell that just gates the route by role and renders the
// client list view.

import { requireRoleAccess } from '@/lib/auth/server';
import { ClaimsListView } from './ClaimsListView';

export const dynamic = 'force-dynamic';

export default async function EmployeeClaimsPage() {
  // opiekun is excluded: he has no claims (wnioski) access at all (decision
  // 2026-10-22, docs/03-roles.md §opiekun). The parent `(employee)/layout.tsx`
  // admits admin/pracownik/opiekun, so this page narrows it — the edge already
  // bounces opiekun via `ROLE_RESTRICTED_EMPLOYEE_PREFIXES` in `lib/roles.ts`
  // (nav hides the tab too); this server check is the defense-in-depth layer.
  await requireRoleAccess(['admin', 'pracownik']);

  return <ClaimsListView />;
}
