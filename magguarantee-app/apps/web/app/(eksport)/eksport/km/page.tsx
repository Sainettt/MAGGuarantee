// Phase 7.7 — `/eksport/km`. Read-only km-report (docs/14 §7.7.7); for eksport
// the report scopes to all vehicles (per the contract). The `(eksport)`
// route-group layout gates access + wraps in <RoleShell>; this page delegates
// to the shared <KmBoardScreen mode="view">.

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

export const dynamic = 'force-dynamic';

export default function EksportKmReportPage() {
  return <KmBoardScreen mode="view" />;
}
