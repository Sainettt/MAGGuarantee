// Phase 4.5 — `/employee/diagnostics` (admin). The `(admin)` route-group
// layout gates non-admins.

import { DiagnosticsView } from './DiagnosticsView';

export const dynamic = 'force-dynamic';

export default function DiagnosticsPage() {
  return <DiagnosticsView />;
}
