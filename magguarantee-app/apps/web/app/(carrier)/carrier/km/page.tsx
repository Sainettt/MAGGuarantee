// Phase 7.8 — `/carrier/km` «Moje pojazdy — przebieg» (docs/14 §7.8).
//
// The strictly READ-ONLY weekly km tab for the carrier — server-scoped to
// their OWN vehicles (one carrier), so the §7.8.3 single-carrier collapse
// always applies and the grid renders ungrouped + accent-free. The
// `(carrier)` route-group layout gates access + wraps in <CarrierShell>;
// this page delegates to the shared <KmBoardScreen mode="view"> with the
// §7.8 chrome (`myKmScope="carrier"`), the in-motion filter OFF by default
// (`inMotionDefault={false}` — show the full fleet), and `groupByCarrier`
// (a no-op for a single carrier, kept for consistency).

import { KmBoardScreen } from '@/components/km/KmBoardScreen';

export const dynamic = 'force-dynamic';

export default function CarrierKmPage() {
  return (
    <KmBoardScreen
      mode="view"
      myKmScope="carrier"
      inMotionDefault={false}
      groupByCarrier
    />
  );
}
