import { CarrierShell } from '@/components/carrier/CarrierShell';

export default function CarrierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CarrierShell>{children}</CarrierShell>;
}
