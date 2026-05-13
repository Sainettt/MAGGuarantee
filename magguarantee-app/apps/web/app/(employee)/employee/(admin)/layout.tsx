// Admin-only route guard inside the employee shell. The `(admin)` route
// group doesn't change the URL — `/employee/carriers` still resolves to
// that path — but everything nested under here is gated by this layout.
//
// Why this exists: middleware checks JWT + path allow-list, but Phase 2
// admin pages have lived under `/employee/(admin)/*` so the guarantee
// must hold even if a `pracownik` types `/employee/carriers` directly
// (their nav hides the link, but the route would otherwise render).
// docs/03-roles.md#pracownik narrows pracownik to Dashboard + Wnioski only;
// the admin CRUD tables (Carriers, Vehicles, Drivers, Trailers, Trailer
// types) — plus Phase 4 sub-slices (Limits, Users, Audit, Diagnostics) —
// are admin-exclusive.
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
