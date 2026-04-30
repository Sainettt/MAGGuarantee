import { RoleShell } from '@/components/layout/RoleShell';

export default function EksportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell>{children}</RoleShell>;
}
