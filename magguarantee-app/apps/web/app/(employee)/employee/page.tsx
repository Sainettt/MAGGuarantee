// Phase 4 — `/employee` root redirect. Both admin and pracownik land on
// `/employee/dashboard` (the dashboard page itself is built in sub-slice
// 4.1; for now this redirect is the contract the shell promises).
//
// opiekun also hits `/employee` per `ROLE_LANDING` — they'll get a
// dashboard-route 404 until Phase 5 wires their version. That's an
// expected gap during Phase 4.0 (see task brief).

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function EmployeeRootPage(): never {
  redirect('/employee/dashboard');
}
