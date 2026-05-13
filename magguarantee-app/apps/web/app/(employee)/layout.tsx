// Phase 4 — server-component layout for the employee shell.
//
// Three roles can reach this layout: `admin`, `pracownik`, and `opiekun`
// (per docs/03-roles.md). `admin` and `pracownik` are the focus of Phase 4;
// `opiekun` gets its own ownership-scoped nav in Phase 5 — for now they
// land here with an empty nav (filtered out by `EMPLOYEE_NAV.roles`) but
// can still reach this shell so the `/employee/forbidden` fallback page
// and any future opiekun-scoped routes resolve.
//
// Auth/role gating happens server-side via `requireRoleAccess()` (which
// round-trips the API for the source-of-truth user record), with edge
// middleware as a first line of defense. Admin-only sub-segments
// (`carriers`, `vehicles`, `drivers`, `trailers`, `trailer-types`) have
// their own nested guard at `(admin)/layout.tsx`.
//
// Nav filtering happens here in the server context — what a given role
// can't see isn't shipped to the client at all.

import { EmployeeShell } from '@/components/layout/EmployeeShell';
import { requireRoleAccess } from '@/lib/auth/server';
import { filterNavForRole } from '@/lib/nav.config';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRoleAccess(['admin', 'pracownik', 'opiekun']);

  // Strip the `roles` array — the client doesn't need it, and dropping it
  // keeps the RSC payload smaller (no per-link redundancy).
  const navItems = filterNavForRole(user.role).map(
    ({ key, href, labelKey, iconName }) => ({
      key,
      href,
      labelKey,
      iconName,
    }),
  );

  return <EmployeeShell navItems={navItems}>{children}</EmployeeShell>;
}
