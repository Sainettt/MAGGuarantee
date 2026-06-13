// Phase 7.8 — `/planista/moje-pojazdy` «Moje pojazdy — przebieg» (docs/14
// §7.8). The strictly READ-ONLY multi-carrier weekly km tab for the planista
// — server-scoped to vehicles where they are the planner (potentially many
// carriers, so the §7.8.1 carrier grouping kicks in for ≥2 carriers). This is
// the more-presentable §7.8 sibling of the plain §7.7.7 report at
// `/planista/km`. The `(planista)` route-group layout gates access + wraps in
// <RoleShell>; this page delegates to <KmBoardScreen mode="view"> with the
// §7.8 chrome, the in-motion filter OFF by default, and carrier grouping on.

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

export const dynamic = 'force-dynamic';

export default function PlanistaMyKmPage() {
  return (
    <KmBoardScreen
      mode="view"
      myKmScope="planista"
      inMotionDefault={false}
      groupByCarrier
    />
  );
}
