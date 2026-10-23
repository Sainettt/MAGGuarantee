// Server guard of `/employee/teams` — «Zespoły prowadzące» (Phase 11). The
// page is a client component, so its own permission check (docs/25 §3 B4)
// lives in this thin per-segment layout; the `(admin)` layout above gates the
// whole segment.

import { requirePermission } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function TeamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission('teams.manage', { onDenied: 'forbidden' });
  return <>{children}</>;
}
