// `/employee/carriers` — carriers CRUD for admin and opiekun (Phase 5.1: the
// API ownership-scopes the opiekun's rows). Thin server shell: gates the
// route by its nav entry's permission, then renders the client view
// (`CarriersView.tsx`, same directory — fetch, filters, dialogs).
//
// UWAGI #17 — every employee-shell page gates itself server-side. The edge
// twin is `PATH_PERMISSIONS['/employee/carriers']` in `lib/roles.ts` (role
// catalog only, so a pracownik never gets this far); this check also stops a
// right revoked per user (docs/25 B6). Denied → the shell's «Brak dostępu»
// page: an explicit answer instead of a silent bounce, and it cannot loop.

import { requirePermission } from '@/lib/auth/server';

import CarriersView from './CarriersView';

export const dynamic = 'force-dynamic';

export default async function EmployeeCarriersPage() {
  await requirePermission('carriers.read', { onDenied: 'forbidden' });
  return <CarriersView />;
}
