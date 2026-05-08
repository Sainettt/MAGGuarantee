// Server-side role gate for the carrier shell. Edge middleware already
// redirects mismatched roles by inspecting the JWT body, but we re-check
// here against /auth/me so a forged JWT (lying about `role`) is caught
// against the API as source of truth. See docs/03-roles.md#przewoznik.

import { requireRoleAccess } from '@/lib/auth/server';
import { CarrierShell } from '@/components/carrier/CarrierShell';

export const dynamic = 'force-dynamic';

export default async function CarrierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRoleAccess(['admin', 'przewoznik']);
  return <CarrierShell>{children}</CarrierShell>;
}
