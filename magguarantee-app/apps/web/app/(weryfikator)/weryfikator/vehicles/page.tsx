// Phase 7.5 — `/weryfikator/vehicles`. The `(weryfikator)` route-group layout
// gates non-weryfikator (admin debug-fallback) server-side + wraps in
// <RoleShell>; this page delegates to the client view, which owns the filter +
// search + per-row stamp + history-dialog state. docs/14 §7.5.

import { VehicleRouteBoardView } from './VehicleRouteBoardView';

export const dynamic = 'force-dynamic';

export default function WeryfikatorVehiclesPage() {
  return <VehicleRouteBoardView />;
}
