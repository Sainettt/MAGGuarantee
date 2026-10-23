// Permissions that guard no route (docs/25 §1.2 "capability", §3 B3).
//
// B1–B4 kept the route → permission plan here as a hand table
// (`ENDPOINT_PERMISSIONS`) plus the session-only allowlist
// (`AUTHENTICATED_ONLY`). B5 deleted both: the decorators on the controllers
// (`@RequirePermission`, `@AuthenticatedOnly(reason)`) are the only source,
// and their generated mirror is the committed fixture
// `__fixtures__/endpoint-permissions.snapshot.json` (written by
// `npm run authz:snapshot -w api`, compared by `roles-snapshot.spec.ts`).
//
// What stays is data no decorator can show: the capabilities checked inside a
// service. `endpoint-permissions.spec.ts` proves that every catalog permission
// guards a route (per the fixture) or sits here — never both, never neither.

import type { Permission } from '@magguarantee/shared';

/**
 * Permissions that guard no route — they gate a capability inside a service
 * (docs/25 §1.2 "capability"), checked with `can(user, p)` since B3. Value:
 * where.
 */
export const SERVICE_CAPABILITIES: Readonly<Partial<Record<Permission, string>>> = {
  'claims.verify_pending_authorization':
    'ClaimsService._assertMayVerifyInStatus — re-verify in OCZEKUJE_NA_AUTORYZACJE (422 CLAIM_VERIFY_ADMIN_ONLY)',
  'vehicles.rates.read':
    'VehiclesService._scrubForViewer (VehicleDto rates) + DelegationsService._scrubVehicleRates (delegation modal «Stawki»)',
  'vehicles.fuel_card.read': 'VehiclesService._scrubForViewer — fuel card number + PIN',
  'bugbot.submit_idea': 'BugbotHandoffService._assertKindAllowed — kind=idea',
};
