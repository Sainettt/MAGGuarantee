import { RoleShell } from '@/components/layout/RoleShell';

export default function PlanistaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell>{children}</RoleShell>;
}
