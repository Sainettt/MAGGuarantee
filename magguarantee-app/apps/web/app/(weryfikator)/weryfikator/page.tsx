// Phase 7.7 — the weryfikator role lands directly on its one real screen, the
// weekly km-board (docs/14-design-system.md §7.7.11; supersedes the §7.5
// route-status `/weryfikator/vehicles` redirect). Server-side redirect → no
// flash of an intermediate panel. The real screen lives at ./km/page.tsx,
// still inside this role's <RoleShell> group.

import { redirect } from 'next/navigation';

export default function WeryfikatorLandingPage() {
  redirect('/weryfikator/km');
}
