// Phase 5.2 — `/employee/alerts` «Alerty» (document-expiry alerts). Thin
// server shell: gates the route by its nav entry's permission, then renders
// the client view (`AlertsView.tsx`, same directory — fetch + UI).
//
// UWAGI #17 — every employee-shell page gates itself server-side. The edge
// twin is `PATH_PERMISSIONS['/employee/alerts']` in `lib/roles.ts` (role
// catalog only); this check also stops a right revoked per user (docs/25
// B6). Denied → the shell's «Brak dostępu» page, never a bare error state.

import { requirePermission } from '@/lib/auth/server';

import AlertsView from './AlertsView';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  await requirePermission('panel.opiekun', { onDenied: 'forbidden' });
  return <AlertsView />;
}
