import { RoleShell } from '@/components/layout/RoleShell';

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell>{children}</RoleShell>;
}
