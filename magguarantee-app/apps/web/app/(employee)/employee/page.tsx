// `/employee` root redirect — the first nav entry the user can see
// (`employeeLandingPath`): admin/pracownik → /employee/dashboard (Phase 4.3),
// opiekun → /employee/opieka (Phase 5) — unchanged for every role set. With a
// per-user revocation (docs/25 B6) it moves on to the next visible entry, or
// to /employee/forbidden when none is left, so a page that bounces a user to
// his landing can never bounce him back to itself.
// Anonymous/expired token → /login (delegated to `requireRoleAccess`).

import { redirect } from 'next/navigation';

import { effectivePermissionsOf } from '@/lib/auth/permissions';
import { requireRoleAccess } from '@/lib/auth/server';
import { EMPLOYEE_SHELL_ROLES, employeeLandingPath } from '@/lib/nav.config';

export const dynamic = 'force-dynamic';

export default async function EmployeeRootPage(): Promise<never> {
  const user = await requireRoleAccess(EMPLOYEE_SHELL_ROLES);
  redirect(employeeLandingPath(effectivePermissionsOf(user), user.role));
}
