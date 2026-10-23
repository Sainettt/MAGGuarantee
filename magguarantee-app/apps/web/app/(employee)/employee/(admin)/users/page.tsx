// Phase 4.4 — `/employee/users` admin page. Gated by the `(admin)/layout.tsx`
// server guard (a user without any admin-section permission lands on
// `/employee/forbidden`). Thin server-component shell — all state lives in
// the client `<UsersListView>`.

import { requirePermission } from '@/lib/auth/server';

import { UsersListView } from './UsersListView';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  // Defense-in-depth — the (admin) layout already gates the segment, but a
  // typed-URL direct hit benefits from a second check here. Without
  // `users.manage` the caller bounces to his role's landing (the target the
  // former `requireRoleAccess(['admin'])` had).
  await requirePermission('users.manage', { onDenied: 'landing' });

  return <UsersListView />;
}
