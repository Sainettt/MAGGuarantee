import { redirect } from 'next/navigation';

// `/carrier` is a route alias — there is no landing screen for the
// carrier panel. Push everyone straight to the claims list.
export default function CarrierLandingPage() {
  redirect('/carrier/claims');
}
