// Phase 7.8 — `/employee/moje-pojazdy` «Moje pojazdy — przebieg» (docs/14
// §7.8). The strictly READ-ONLY multi-carrier weekly km tab for the opiekun —
// server-scoped to the vehicles of the carriers they supervise (potentially
// many carriers, so the §7.8.1 carrier grouping kicks in for ≥2 carriers).
//
// Lives inside the employee shell (NOT under the `(admin)` segment) so the
// opiekun can reach it. UWAGI #17 — the page gates itself server-side with
// `km.read`, the permission of its nav entry (`moje-pojazdy`, shown to opiekun
// + admin); denied → the shell's «Brak dostępu» page. The edge twin is
// `PATH_PERMISSIONS['/employee/moje-pojazdy']` in `lib/roles.ts` (role catalog
// only). The API role-scopes the payload by the JWT identity. Delegates to
// <KmBoardScreen mode="view"> with the §7.8 chrome, the in-motion filter OFF
// by default, and carrier grouping on.

import { KmBoardScreen } from '@/components/km/KmBoardScreen';
import { requirePermission } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function OpiekunMyKmPage() {
  await requirePermission('km.read', { onDenied: 'forbidden' });
  return (
    <KmBoardScreen
      mode="view"
      myKmScope="opiekun"
      inMotionDefault={false}
      groupByCarrier
    />
  );
}
