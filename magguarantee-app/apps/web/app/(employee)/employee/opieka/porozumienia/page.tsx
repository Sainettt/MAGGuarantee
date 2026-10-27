// Phase 12 — `/employee/opieka/porozumienia`, the «Porozumienia» tab of the
// opieka surface (docs/14 §12.4). Thin server shell: gates the route, then
// renders the client view (`OpiekaPorozumieniaView.tsx`, same directory).
//
// UWAGI #17 — every employee-shell page gates itself server-side, here with
// the «Moja opieka» permission (the tab belongs to that surface). The edge
// twin is `PATH_PERMISSIONS['/employee/opieka']` in `lib/roles.ts` (role
// catalog only — it covers this sub-path); this check also stops a right
// revoked per user (docs/25 B6). Denied → the shell's «Brak dostępu» page.

import { requirePermission } from '@/lib/auth/server';

import OpiekaPorozumieniaView from './OpiekaPorozumieniaView';

export const dynamic = 'force-dynamic';

export default async function OpiekaPorozumieniaPage() {
  await requirePermission('panel.opiekun', { onDenied: 'forbidden' });
  return <OpiekaPorozumieniaView />;
}
