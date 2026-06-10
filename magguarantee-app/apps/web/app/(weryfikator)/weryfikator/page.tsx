// Phase 7.5 — the weryfikator role has a single destination (the vehicle
// route-status board), so its landing route redirects straight there
// (docs/14-design-system.md §7.5.7). Server-side redirect → no flash of an
// intermediate panel. The real screen lives at ./vehicles/page.tsx, still
// inside this role's <RoleShell> group so the header is unchanged.

import { redirect } from 'next/navigation';

export default function WeryfikatorLandingPage() {
  redirect('/weryfikator/vehicles');
}
