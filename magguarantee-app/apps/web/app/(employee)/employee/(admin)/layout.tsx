// Admin-only route guard inside the employee shell. The `(admin)` route
// group doesn't change the URL — `/employee/users` still resolves to that
// path — but everything nested under here is gated by this layout.
//
// Why this exists: middleware checks JWT + path allow-list, but admin-only
// pages live under `/employee/(admin)/*` so the guarantee must hold even
// if a non-admin types the URL directly (their nav hides the link, but the
// route would otherwise render).
//
// Current admin-only pages (Phase 5.1):
//   - trailer-types (per docs/03-roles.md — only admin manages catalogs)
//   - users
//   - limits
//   - audit
//   - diagnostics
//
// Phase 5.1 moved carriers / vehicles / drivers / trailers OUT of this
// group — opiekun can now reach them (CRUD ownership-scoped by the API).
// They live directly under `/employee/<entity>/` and rely on the parent
// `(employee)/layout.tsx` guard (`['admin', 'pracownik', 'opiekun']`)
// plus per-row API enforcement.
//
// We resolve the role server-side via `getServerUser()` (round-trips to
// `/auth/me` with the caller's cookies). Non-admin → redirect to the
// shell's `/forbidden` page (Phase 4 contract; was `/employee` before),
// which gives the user a clear "you don't have access" view instead of a
// silent bounce to the dashboard.

import { redirect } from 'next/navigation';

import { getServerUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function AdminEmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/employee/forbidden');
  return <>{children}</>;
}
