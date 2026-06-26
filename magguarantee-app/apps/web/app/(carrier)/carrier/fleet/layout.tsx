// 2026-06-26 — the carrier fleet area is now ONE unified page
// (`<CarrierFleetPanel>` with in-page tabs); the route-based `<FleetSubTabs>`
// sub-nav was retired. This layout is a thin passthrough kept so the old
// `/carrier/fleet/{vehicles,drivers,trailers}` redirect routes still nest here.

export default function CarrierFleetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
