// Phase 4.5 — `/employee/limits` (admin). The `(admin)` route-group layout
// has already enforced the admin role; this page is a thin shell around
// the client view.

import { LimitsView } from './LimitsView';

export const dynamic = 'force-dynamic';

export default function LimitsPage() {
  return <LimitsView />;
}
