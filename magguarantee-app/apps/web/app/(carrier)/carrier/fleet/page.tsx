// 2026-06-26 — unified carrier fleet page. Renders the single planista-style
// `<CarrierFleetPanel>` (KPI strip + in-page Auta/Kierowcy/Naczepy tabs),
// replacing the three former route-based sub-pages. The route-group
// `layout.tsx` already guards + wraps in the carrier shell, so this page does
// not re-guard. READ-ONLY throughout.

import { CarrierFleetPanel } from '@/components/carrier/CarrierFleetPanel';

export default function CarrierFleetPage() {
  return <CarrierFleetPanel />;
}
