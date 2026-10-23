// Phase 4.5 — `/employee/limits` (admin). The `(admin)` route-group layout
// gates the segment; this page re-checks its own permission (docs/25 §3 B4)
// and is otherwise a thin shell around the client view.

import { requirePermission } from '@/lib/auth/server';

import { LimitsView } from './LimitsView';

export const dynamic = 'force-dynamic';

export default async function LimitsPage() {
  await requirePermission('limits.manage', { onDenied: 'forbidden' });
  return <LimitsView />;
}
