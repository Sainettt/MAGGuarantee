// Phase 7 — the eksport role has a single destination (the delegations board),
// so its landing route redirects straight there (docs/14-design-system.md §7.2).
// Server-side redirect → no flash of an intermediate panel. The real screen
// lives at ./delegations/page.tsx, still inside this role's <RoleShell> group
// so the header is unchanged.

import { redirect } from 'next/navigation';

export default function EksportLandingPage() {
  redirect('/eksport/delegations');
}
