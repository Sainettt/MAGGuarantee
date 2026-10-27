// Phase 5 — `/employee/opieka/carriers/[login]`, the opiekun drill-down for a
// single carrier. Thin server shell: gates the route, then renders the client
// view (`OpiekunCarrierDetailView.tsx`, same directory — it reads `[login]`
// itself via `useParams`).
//
// UWAGI #17 — every employee-shell page gates itself server-side, with the
// permission of the «Moja opieka» nav entry it drills down from. The edge
// twin is `PATH_PERMISSIONS['/employee/opieka']` in `lib/roles.ts` (role
// catalog only — it covers this sub-path); this check also stops a right
// revoked per user (docs/25 B6). Denied → the shell's «Brak dostępu» page.

import { requirePermission } from '@/lib/auth/server';

import OpiekunCarrierDetailView from './OpiekunCarrierDetailView';

export const dynamic = 'force-dynamic';

export default async function OpiekunCarrierDetailPage() {
  await requirePermission('panel.opiekun', { onDenied: 'forbidden' });
  return <OpiekunCarrierDetailView />;
}
