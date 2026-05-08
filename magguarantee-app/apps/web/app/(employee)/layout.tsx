// Server-side role gate for the employee shell. Three roles share this
// shell: admin (sees everything), pracownik (Dashboard + Wnioski only),
// opiekun (adds Moja opieka). Admin-only sub-paths are gated separately
// in `(admin)/layout.tsx`. See docs/03-roles.md.

import { requireRoleAccess } from '@/lib/auth/server';
import { EmployeeShell } from '@/components/layout/EmployeeShell';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRoleAccess(['admin', 'pracownik', 'opiekun']);
  return <EmployeeShell>{children}</EmployeeShell>;
}
