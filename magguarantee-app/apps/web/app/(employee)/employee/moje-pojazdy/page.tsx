// Phase 7.8 — `/employee/moje-pojazdy` «Moje pojazdy — przebieg» (docs/14
// §7.8). The strictly READ-ONLY multi-carrier weekly km tab for the opiekun —
// server-scoped to the vehicles of the carriers they supervise (potentially
// many carriers, so the §7.8.1 carrier grouping kicks in for ≥2 carriers).
//
// Lives inside the employee shell (NOT under the `(admin)` segment) so the
// opiekun can reach it; the parent `/employee/layout.tsx` already gates the
// shell to admin + pracownik + opiekun, and the nav entry (`moje-pojazdy`)
// only surfaces it to opiekun + admin. The API role-scopes the payload by the
// JWT identity. Delegates to <KmBoardScreen mode="view"> with the §7.8 chrome,
// the in-motion filter OFF by default, and carrier grouping on.

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

export const dynamic = 'force-dynamic';

export default function OpiekunMyKmPage() {
  return (
    <KmBoardScreen
      mode="view"
      myKmScope="opiekun"
      inMotionDefault={false}
      groupByCarrier
    />
  );
}
