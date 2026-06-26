// 2026-06-26 — retired sub-route. The carrier fleet is now ONE unified page
// (`/carrier/fleet`) with in-page tabs. This old `/carrier/fleet/trailers`
// route redirects to the unified page on the «Naczepy» tab.

import { redirect } from 'next/navigation';

export default function CarrierTrailersRedirect() {
  redirect('/carrier/fleet?tab=trailers');
}
