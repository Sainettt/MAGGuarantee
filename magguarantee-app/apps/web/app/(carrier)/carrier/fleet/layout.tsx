import { FleetSubTabs } from '@/components/carrier/FleetSubTabs';

export default function CarrierFleetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <FleetSubTabs />
      {children}
    </div>
  );
}
