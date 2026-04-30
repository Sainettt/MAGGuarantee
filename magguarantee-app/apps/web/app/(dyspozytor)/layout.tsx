import { RoleShell } from '@/components/layout/RoleShell';

export default function DyspozytorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell>{children}</RoleShell>;
}
