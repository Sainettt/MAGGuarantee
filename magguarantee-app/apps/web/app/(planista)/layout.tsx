// Server-side role gate for the planista shell. Admin allowed for
// debug-fallback (docs/03-roles.md#admin).
//
// docs/14 §17.4.2 (D2) — the role now has ≥3 destinations (fleet, km, own
// transfer requests, and for a lider the approvals inbox), so the shell renders
// the route-based <PlanistaTabsNav> above every page. It sits inside
// <RoleShell>'s session gate, so it renders only once `/auth/me` resolved (the
// lider tab needs `user.lider`).

import { requireRoleAccess } from '@/lib/auth/server';
import { RoleShell } from '@/components/layout/RoleShell';

import { PlanistaTabsNav } from './PlanistaTabsNav';

export const dynamic = 'force-dynamic';

export default async function PlanistaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRoleAccess(['admin', 'planista']);
  return (
    <RoleShell>
      <PlanistaTabsNav />
      {children}
    </RoleShell>
  );
}
