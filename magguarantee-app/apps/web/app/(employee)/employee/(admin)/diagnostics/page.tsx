// Phase 4.5 — `/employee/diagnostics` (admin). The `(admin)` route-group
// layout gates the segment; this page re-checks its own permission
// (docs/25 §3 B4).

import { requirePermission } from '@/lib/auth/server';

import { DiagnosticsView } from './DiagnosticsView';

export const dynamic = 'force-dynamic';

export default async function DiagnosticsPage() {
  await requirePermission('diagnostics.manage', { onDenied: 'forbidden' });
  return <DiagnosticsView />;
}
