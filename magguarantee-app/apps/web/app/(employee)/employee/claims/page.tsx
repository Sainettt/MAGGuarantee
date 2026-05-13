// Phase 4 — `/employee/claims`. Accessible by admin + pracownik per the
// `EmployeeLayout` guard (no extra `(admin)` segment needed — pracownik
// is the primary target). The page is a thin server-component shell that
// just gates the route by role and renders the client list view.

import { requireRoleAccess } from '@/lib/auth/server';
import { ClaimsListView } from './ClaimsListView';

export const dynamic = 'force-dynamic';

export default async function EmployeeClaimsPage() {
  // Defense-in-depth: the parent `(employee)/layout.tsx` already restricts
  // the route group to admin/pracownik/opiekun. opiekun has no nav entry
  // here in Phase 4 but a typed URL would still resolve — we keep them on
  // this page to a 403-ish empty view (the API will scope results to
  // their own carriers anyway, which is acceptable). For now we let
  // admin + pracownik in explicitly.
  await requireRoleAccess(['admin', 'pracownik']);

  return <ClaimsListView />;
}
