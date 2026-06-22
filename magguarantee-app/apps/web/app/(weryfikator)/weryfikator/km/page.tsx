// Phase 7.7 — `/weryfikator/km`. The editable weekly km-board (docs/14 §7.7).
// The `(weryfikator)` route-group layout gates non-weryfikator (admin
// debug-fallback) server-side + wraps in <RoleShell>; this page delegates to
// the shared <KmBoardScreen mode="edit"> client island, which owns the week
// URL param, header tiles, week navigation, in-cell editing, and the
// per-vehicle history dialog.
//
// Phase 7.10 — the role gained a SECOND screen (delegation statuses), so the
// km-board now sits under the shared <WeryfikatorTabsNav> two-tab bar (§7.10.2).

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

import { WeryfikatorTabsNav } from '../WeryfikatorTabsNav';

export const dynamic = 'force-dynamic';

export default function WeryfikatorKmPage() {
  return (
    <>
      <WeryfikatorTabsNav />
      <KmBoardScreen mode="edit" />
    </>
  );
}
