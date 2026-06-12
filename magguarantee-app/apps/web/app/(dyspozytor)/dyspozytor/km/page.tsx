// Phase 7.7 — `/dyspozytor/km`. Read-only km-report (docs/14 §7.7.7), scoped
// server-side to the dispatcher's own team vehicles. The `(dyspozytor)`
// route-group layout gates access + wraps in <RoleShell>; this page delegates
// to the shared <KmBoardScreen mode="view">.

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

export const dynamic = 'force-dynamic';

export default function DyspozytorKmReportPage() {
  return <KmBoardScreen mode="view" />;
}
