// Server-side role gate for the eksport shell. Admin allowed for
// debug-fallback (docs/03-roles.md#admin).

import { requireRoleAccess } from '@/lib/auth/server';
import { RoleShell } from '@/components/layout/RoleShell';

export const dynamic = 'force-dynamic';

export default async function EksportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRoleAccess(['admin', 'eksport']);
  return <RoleShell>{children}</RoleShell>;
}
