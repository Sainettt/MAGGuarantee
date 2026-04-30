import { RoleShell } from '@/components/layout/RoleShell';

export default function CarrierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell>{children}</RoleShell>;
}
