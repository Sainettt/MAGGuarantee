// Phase 4.4 — `/employee/users` admin page. Gated to `admin` only by the
// `(admin)/layout.tsx` server guard (pracownik or any other role lands on
// `/employee/forbidden`). Thin server-component shell — all state lives in
// the client `<UsersListView>`.

import { requireRoleAccess } from '@/lib/auth/server';

import { UsersListView } from './UsersListView';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  // Defense-in-depth — the (admin) layout already enforces admin, but a
  // typed-URL direct hit benefits from a second check here. Non-admin
  // bounces to /employee/forbidden (handled by the helper).
  await requireRoleAccess(['admin']);

  return <UsersListView />;
}
