// 2026-06-26 — retired sub-route. The carrier fleet is now ONE unified page
// (`/carrier/fleet`) with in-page Auta/Kierowcy/Naczepy tabs. This old
// `/carrier/fleet/vehicles` route redirects to the «Auta» tab (the default).

import { redirect } from 'next/navigation';

export default function CarrierVehiclesRedirect() {
  redirect('/carrier/fleet');
}
