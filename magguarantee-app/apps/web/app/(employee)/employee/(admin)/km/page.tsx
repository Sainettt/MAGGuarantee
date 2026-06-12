// Phase 7.7 — `/employee/km` (admin). Read-only km-report (docs/14 §7.7.7),
// unscoped for admin (all vehicles). The `(admin)` route-group layout gates
// non-admins server-side; this page delegates to the shared
// <KmBoardScreen mode="view"> inside the employee shell.

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

export const dynamic = 'force-dynamic';

export default function AdminKmReportPage() {
  return <KmBoardScreen mode="view" />;
}
