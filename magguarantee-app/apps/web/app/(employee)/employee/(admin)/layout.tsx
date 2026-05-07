// Admin-only route guard for the employee shell. The `(admin)` route group
// doesn't change the URL — `/employee/carriers` still resolves to that path —
// but everything nested under here is gated by this layout.
//
// Why this exists: middleware.ts only checks for the `mt_access` cookie, not
// the role. Without this guard a `pracownik` could type `/employee/carriers`
// directly and reach the page (their nav row hides it, but the route renders).
// docs/03-roles.md#pracownik narrows pracownik to Dashboard + Wnioski only;
// the admin CRUD tables (Carriers, Vehicles, Drivers, Trailers, Trailer types)
// are admin-exclusive in Phase 3.
//
// We resolve the role server-side via `getServerUser()` (round-trips to
// `/auth/me` with the caller's cookies) — same pattern as `app/page.tsx`. If
// the user isn't admin we `redirect('/employee')` so they land on the bare
// employee shell.

import { redirect } from 'next/navigation';

import { getServerUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function AdminEmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  // Defense in depth — middleware.ts already redirects non-admin away from
  // these routes by inspecting the JWT role claim. This server-side check
  // catches the case where the JWT was tampered with (or middleware was
  // bypassed somehow); we still query the API as the source of truth.
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/employee');
  return <>{children}</>;
}
