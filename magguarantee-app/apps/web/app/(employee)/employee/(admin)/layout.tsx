// Admin-section route guard inside the employee shell. The `(admin)` route
// group doesn't change the URL — `/employee/users` still resolves to that
// path — but everything nested under here is gated by this layout.
//
// Why this exists: middleware checks JWT + path allow-list, but the admin
// pages live under `/employee/(admin)/*` so the guarantee must hold even
// if a user types the URL directly (their nav hides the link, but the
// route would otherwise render).
//
// Current pages (Phase 5.1) and the permission each one re-checks itself:
//   - trailer-types  `trailer_types.manage` (docs/03-roles.md — catalogs)
//   - teams          `teams.manage`
//   - users          `users.manage`
//   - sso            `sso.manage`
//   - limits         `limits.manage`
//   - audit          `audit.read`
//   - diagnostics    `diagnostics.manage`
//   - delegations    scope: role `admin` (see its page)
//
// Phase 5.1 moved carriers / vehicles / drivers / trailers OUT of this
// group — opiekun can now reach them (CRUD ownership-scoped by the API).
// They live directly under `/employee/<entity>/` and rely on the parent
// `(employee)/layout.tsx` guard plus per-row API enforcement.
//
// docs/25 §3 B4: the segment admits a user holding AT LEAST ONE of
// `ADMIN_SECTION_PERMISSIONS` (today: admin only), resolved server-side from
// `/auth/me`. Anyone else → the shell's `/forbidden` page (Phase 4 contract;
// was `/employee` before), a clear "you don't have access" view instead of a
// silent bounce to the dashboard.

import { ADMIN_SECTION_PERMISSIONS } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function AdminEmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission(ADMIN_SECTION_PERMISSIONS, { onDenied: 'forbidden' });
  return <>{children}</>;
}
