// Phase 4.5 — `/employee/audit` (admin). The `(admin)` route-group layout
// gates the segment; this page re-checks its own permission (docs/25 §3 B4).
// We delegate the entire view to the client component because the page owns
// interactive filter state.

import { requirePermission } from '@/lib/auth/server';

import { AuditView } from './AuditView';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requirePermission('audit.read', { onDenied: 'forbidden' });
  return <AuditView />;
}
