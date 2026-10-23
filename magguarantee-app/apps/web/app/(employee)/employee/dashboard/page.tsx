// Phase 4.3 — `/employee/dashboard`. Admin + pracownik land here per
// `EmployeeLayout`'s allow-list. Server-component shell mirrors the claims
// list pattern: permission-gate (`dashboard.read`, denied → the role's
// landing), then delegate to the client view that owns the TanStack fetch +
// rendering.

import { requirePermission } from '@/lib/auth/server';

import { DashboardView } from './DashboardView';

export const dynamic = 'force-dynamic';

export default async function EmployeeDashboardPage() {
  await requirePermission('dashboard.read', { onDenied: 'landing' });
  return <DashboardView />;
}
