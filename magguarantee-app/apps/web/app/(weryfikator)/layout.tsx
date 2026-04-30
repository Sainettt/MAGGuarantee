import { RoleShell } from '@/components/layout/RoleShell';

export default function WeryfikatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell>{children}</RoleShell>;
}
