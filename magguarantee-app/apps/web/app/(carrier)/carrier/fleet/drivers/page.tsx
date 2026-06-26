// 2026-06-26 — retired sub-route. The carrier fleet is now ONE unified page
// (`/carrier/fleet`) with in-page tabs. This old `/carrier/fleet/drivers`
// route redirects to the unified page on the «Kierowcy» tab.

import { redirect } from 'next/navigation';

export default function CarrierDriversRedirect() {
  redirect('/carrier/fleet?tab=drivers');
}
