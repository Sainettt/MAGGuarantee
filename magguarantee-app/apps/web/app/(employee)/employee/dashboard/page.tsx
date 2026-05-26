// Phase 4.3 — `/employee/dashboard`. Admin + pracownik land here per
// `EmployeeLayout`'s allow-list. Server-component shell mirrors the claims
// list pattern: role-gate, then delegate to the client view that owns the
// TanStack fetch + rendering.

import { requireRoleAccess } from '@/lib/auth/server';

import { DashboardView } from './DashboardView';

export const dynamic = 'force-dynamic';

export default async function EmployeeDashboardPage() {
  await requireRoleAccess(['admin', 'pracownik']);
  return <DashboardView />;
}
