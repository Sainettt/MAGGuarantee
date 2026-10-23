// Phase 4 — `/employee/claims`. admin + pracownik only (no extra `(admin)`
// segment needed — pracownik is the primary target). The page is a thin
// server-component shell that just gates the route by permission and renders
// the client list view.

import { requirePermission } from '@/lib/auth/server';
import { ClaimsListView } from './ClaimsListView';

export const dynamic = 'force-dynamic';

export default async function EmployeeClaimsPage() {
  // opiekun is excluded: he has no claims (wnioski) access at all (decision
  // 2026-10-22, docs/03-roles.md §opiekun) — he does not hold `claims.read`.
  // The parent `(employee)/layout.tsx` admits admin/pracownik/opiekun, so this
  // page narrows it — the edge already bounces opiekun via `PATH_PERMISSIONS`
  // in `lib/roles.ts` (nav hides the tab too); this server check is the
  // defense-in-depth layer. Denied → the role's landing, as before.
  await requirePermission('claims.read', { onDenied: 'landing' });

  return <ClaimsListView />;
}
