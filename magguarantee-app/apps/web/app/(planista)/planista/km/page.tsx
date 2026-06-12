// Phase 7.7 — `/planista/km`. Read-only km-report (docs/14 §7.7.7), scoped
// server-side to the planista's own vehicles (`plannerId`). The `(planista)`
// route-group layout gates access + wraps in <RoleShell>; this page delegates
// to the shared <KmBoardScreen mode="view">.

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

export const dynamic = 'force-dynamic';

export default function PlanistaKmReportPage() {
  return <KmBoardScreen mode="view" />;
}
