// Phase 5 — `/employee/opieka` «Moja opieka», the opiekun dashboard. Thin
// server shell: gates the route by its nav entry's permission, then renders
// the client view (`OpiekaView.tsx`, same directory — fetch + UI).
//
// UWAGI #17 — every employee-shell page gates itself server-side. The edge
// twin is `PATH_PERMISSIONS['/employee/opieka']` in `lib/roles.ts` (role
// catalog only), so this check is what stops an opiekun whose `panel.opiekun`
// was revoked per user (docs/25 B6). Denied → the shell's «Brak dostępu»
// page: an explicit answer instead of a silent bounce, and it cannot loop.

import { requirePermission } from '@/lib/auth/server';

import OpiekaView from './OpiekaView';

export const dynamic = 'force-dynamic';

export default async function OpiekaPage() {
  await requirePermission('panel.opiekun', { onDenied: 'forbidden' });
  return <OpiekaView />;
}
