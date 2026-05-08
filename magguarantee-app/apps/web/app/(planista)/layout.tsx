// Server-side role gate for the planista shell. Admin allowed for
// debug-fallback (docs/03-roles.md#admin).

import { requireRoleAccess } from '@/lib/auth/server';
import { RoleShell } from '@/components/layout/RoleShell';

export const dynamic = 'force-dynamic';

export default async function PlanistaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRoleAccess(['admin', 'planista']);
  return <RoleShell>{children}</RoleShell>;
}
