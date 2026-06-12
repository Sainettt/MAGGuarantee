// Phase 7.7 — `/weryfikator/km`. The editable weekly km-board (docs/14 §7.7).
// The `(weryfikator)` route-group layout gates non-weryfikator (admin
// debug-fallback) server-side + wraps in <RoleShell>; this page delegates to
// the shared <KmBoardScreen mode="edit"> client island, which owns the week
// URL param, header tiles, week navigation, in-cell editing, and the
// per-vehicle history dialog.

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

export const dynamic = 'force-dynamic';

export default function WeryfikatorKmPage() {
  return <KmBoardScreen mode="edit" />;
}
