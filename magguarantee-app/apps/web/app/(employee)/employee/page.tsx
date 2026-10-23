// `/employee` root redirect — dispatches by role.
// admin/pracownik → /employee/dashboard (Phase 4.3).
// opiekun → /employee/opieka (Phase 5).
// Anonymous/expired token → /login (delegated to `requireRoleAccess`).

import { redirect } from 'next/navigation';

import { requireRoleAccess } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function EmployeeRootPage(): Promise<never> {
  const user = await requireRoleAccess(['admin', 'pracownik', 'opiekun']);
  // scope: a landing is per panel role (like `ROLE_LANDING`), not a right.
  redirect(user.role === 'opiekun' ? '/employee/opieka' : '/employee/dashboard');
}
