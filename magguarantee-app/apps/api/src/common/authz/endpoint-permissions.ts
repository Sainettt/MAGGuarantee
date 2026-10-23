// Route → permission plan for track B (docs/25 §3 B1 → B2).
//
// B1: pure data, read by no guard. `endpoint-permissions.spec.ts` proves that
// for every role-gated route in the committed `@Roles` snapshot
// (`__fixtures__/endpoint-roles.snapshot.json`)
//   rolesSatisfying(ENDPOINT_PERMISSIONS[route], { lider: true }) === snapshot[route]
// i.e. that the catalog in `@magguarantee/shared` reproduces the pre-track-B
// access exactly.
//
// B2 (done 2026-10-23): every `@Roles(...)` became
// `@RequirePermission(...ENDPOINT_PERMISSIONS[route])` (any-of, like `@Roles`).
// The same spec checks that the live decorators equal this table route for
// route and that every other non-`@Public` route is in `AUTHENTICATED_ONLY`.
// Still read by no guard; B5 deletes the table once the decorators are the
// only source.
//
// Keys: `METHOD /path` without the `api/v1` prefix (the snapshot format).

import type { Permission } from '@magguarantee/shared';

/**
 * Required permissions (any-of) per role-gated route. Exactly the routes the
 * snapshot records with a role array — no `PUBLIC`, no `AUTHENTICATED`.
 */
export const ENDPOINT_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  // ── claims (wnioski) ──
  'GET /claims': ['claims.read'],
  'GET /claims/:nrZgl': ['claims.read'],
  'POST /claims': ['claims.submit'],
  'POST /claims/preview': ['claims.submit'],
  'POST /claims/:nrZgl/reklamacja': ['claims.submit'],
  // Live km-calc of an EXISTING wniosek: the carrier's reklamacja form and the
  // verifier's edit mode — whoever may amend it may preview the amendment.
  'POST /claims/:nrZgl/preview': ['claims.submit', 'claims.verify'],
  'PATCH /claims/:nrZgl': ['claims.verify'],
  'PATCH /claims/:nrZgl/verification': ['claims.verify'],
  'GET /claims/:nrZgl/recalc-limits/preview': ['claims.verify'],
  'POST /claims/:nrZgl/recalc-limits': ['claims.verify'],
  'POST /claims/:nrZgl/authorization-confirmation': ['claims.verify'],
  'GET /claims/:nrZgl/authorization-confirmation/:attachmentId/download': ['claims.verify'],
  'GET /diagnostics/dashboard': ['dashboard.read'],

  // ── carriers ──
  'GET /carriers': ['carriers.read'],
  'GET /carriers/:id': ['carriers.read'],
  'POST /carriers': ['carriers.write'],
  'PATCH /carriers/:id': ['carriers.write'],
  'POST /carriers/:id/deactivate': ['carriers.write'],
  'POST /carriers/:id/reactivate': ['carriers.write'],
  'POST /carriers/:id/reset-password': ['carriers.write'],
  'DELETE /carriers/:id': ['carriers.delete'],
  'DELETE /carriers/:id/hard': ['carriers.delete'],
  // Carrier documents (decision 2026-10-23, docs/25 B6 first case).
  'GET /carriers/:id/attachments': ['carrier_documents.read'],
  'GET /carriers/:id/attachments/:attachmentId/download': ['carrier_documents.read'],
  'GET /carriers/:id/documents/overview': ['carrier_documents.read'],
  'POST /carriers/:id/attachments': ['carrier_documents.add'],
  'DELETE /carriers/:id/attachments/:attachmentId': ['carrier_documents.delete'],

  // ── vehicles ──
  'GET /vehicles': ['vehicles.read'],
  'GET /vehicles/:id': ['vehicles.read'],
  'GET /vehicles/:id/attachments': ['vehicles.read'],
  'GET /vehicles/:id/attachments/:attachmentId/download': ['vehicles.read'],
  'POST /vehicles': ['fleet.write'],
  'PATCH /vehicles/:id': ['fleet.write'],
  'POST /vehicles/:id/deactivate': ['fleet.write'],
  'POST /vehicles/:id/reactivate': ['fleet.write'],
  'DELETE /vehicles/:id': ['fleet.write'],
  'DELETE /vehicles/:id/attachments/:attachmentId': ['fleet.write'],

  // ── planner transfers (docs/29) ──
  'POST /vehicles/:id/planner-transfers': ['vehicles.planner_transfer.request'],
  'POST /planner-transfers/:id/cancel': ['vehicles.planner_transfer.request'],
  // `@Roles('admin', 'planista')`: a planista passes only as a lider
  // (`LIDER_PERMISSIONS.planista`); the service checks "lider of THIS fromPlanner".
  'POST /planner-transfers/:id/approve': ['vehicles.planner_transfer.decide'],
  'POST /planner-transfers/:id/reject': ['vehicles.planner_transfer.decide'],
  // One route, two inboxes: `scope=mine` (request) / `scope=decide` (decide).
  'GET /planner-transfers': [
    'vehicles.planner_transfer.request',
    'vehicles.planner_transfer.decide',
  ],
  // Target picker of the request form; the decide side needs it too (admin).
  'GET /lookups/planisci/transfer-targets': [
    'vehicles.planner_transfer.request',
    'vehicles.planner_transfer.decide',
  ],
  'GET /vehicles/:id/planner-history': ['vehicles.planner_history.read'],

  // ── drivers / trailers ──
  'GET /drivers': ['drivers.read'],
  'GET /drivers/:id': ['drivers.read'],
  'GET /drivers/:id/attachments': ['drivers.read'],
  'GET /drivers/:id/attachments/:attachmentId/download': ['drivers.read'],
  'POST /drivers': ['fleet.write'],
  'PATCH /drivers/:id': ['fleet.write'],
  'POST /drivers/:id/deactivate': ['fleet.write'],
  'POST /drivers/:id/reactivate': ['fleet.write'],
  'DELETE /drivers/:id': ['fleet.write'],
  'DELETE /drivers/:id/attachments/:attachmentId': ['fleet.write'],
  'DELETE /drivers/:id/hard': ['fleet.hard_delete'],
  'GET /trailers': ['trailers.read'],
  'GET /trailers/:id': ['trailers.read'],
  'GET /trailers/:id/attachments': ['trailers.read'],
  'GET /trailers/:id/attachments/:attachmentId/download': ['trailers.read'],
  'POST /trailers': ['fleet.write'],
  'PATCH /trailers/:id': ['fleet.write'],
  'POST /trailers/:id/deactivate': ['fleet.write'],
  'POST /trailers/:id/reactivate': ['fleet.write'],
  'DELETE /trailers/:id': ['fleet.write'],
  'DELETE /trailers/:id/attachments/:attachmentId': ['fleet.write'],
  'DELETE /trailers/:id/hard': ['fleet.hard_delete'],

  // ── GPS ──
  'GET /integrations/gps/positions': ['gps.read'],
  'GET /integrations/gps/positions/:vehicleId': ['gps.read'],
  'GET /integrations/gps/trips/:vehicleId': ['gps.read'],
  'POST /integrations/gps/refresh': ['gps.refresh'],

  // ── delegations (wyjazdy) + km ──
  'GET /delegations': ['delegations.read'],
  'GET /delegations/:id': ['delegations.read'],
  'POST /delegations': ['delegations.create'],
  'GET /delegations/eligibility': ['delegations.create'],
  'POST /delegations/:id/cancel': ['delegations.cancel'],
  'POST /delegations/:id/ready': ['delegations.mark_ready'],
  'POST /delegations/:id/in-transit': ['delegations.transit'],
  'POST /delegations/:id/returned': ['delegations.transit'],
  'GET /vehicles/km-report': ['km.read'],
  'GET /vehicles/:id/daily-km': ['km.read'],
  'GET /vehicles/km-board': ['km.verify'],
  'PUT /vehicles/:id/daily-km': ['km.verify'],
  'DELETE /vehicles/:id/daily-km': ['km.verify'],

  // ── role panels ──
  'GET /fleet/opiekun': ['panel.opiekun'],
  'GET /opiekun/carriers': ['panel.opiekun'],
  'GET /alerts': ['panel.opiekun'],
  'GET /guarantee-compliance': ['panel.opiekun'],
  'GET /guarantee-episodes': ['panel.opiekun'],
  'GET /fleet/planista': ['panel.planista'],
  'GET /fleet/dyspozytor': ['panel.dyspozytor'],
  'GET /fleet/my': ['panel.carrier'],
  'GET /guarantee-compliance/me': ['panel.carrier'],
  'GET /guarantee-episodes/me': ['panel.carrier'],

  // ── lookups + external integrations ──
  'GET /lookups/dyspozytor': ['lookups.staff'],
  'GET /lookups/opiekuni': ['lookups.staff'],
  'GET /lookups/planisci': ['lookups.staff'],
  'GET /lookups/teams': ['lookups.staff'],
  'GET /lookups/carriers': ['lookups.carriers'],
  'POST /integrations/vies/check': ['integrations.external'],
  'POST /integrations/whitelist/check': ['integrations.external'],
  'POST /integrations/whitelist/search': ['integrations.external'],

  // ── administration ──
  'GET /users': ['users.manage'],
  'GET /users/:id': ['users.manage'],
  'POST /users': ['users.manage'],
  'PATCH /users/:id': ['users.manage'],
  'POST /users/:id/deactivate': ['users.manage'],
  'POST /users/:id/reactivate': ['users.manage'],
  'POST /users/:id/reset-password': ['users.manage'],
  'DELETE /users/:id': ['users.manage'],
  'GET /lookups/users': ['users.manage'],
  // UserSheet «Przełożony (lider)» picker — part of user management.
  'GET /lookups/planisci/liders': ['users.manage'],
  'GET /sso/access-denials': ['sso.manage'],
  'POST /sso/access-grants': ['sso.manage'],
  'GET /sso/stanowisko-roles': ['sso.manage'],
  'PUT /sso/stanowisko-roles/:code': ['sso.manage'],
  'DELETE /sso/stanowisko-roles/:code': ['sso.manage'],
  'GET /teams': ['teams.manage'],
  'GET /teams/:id': ['teams.manage'],
  'POST /teams': ['teams.manage'],
  'PATCH /teams/:id': ['teams.manage'],
  'POST /teams/:id/deactivate': ['teams.manage'],
  'POST /teams/:id/reactivate': ['teams.manage'],
  'DELETE /teams/:id': ['teams.manage'],
  'POST /trailer-types': ['trailer_types.manage'],
  'PATCH /trailer-types/:id': ['trailer_types.manage'],
  'POST /trailer-types/:id/deactivate': ['trailer_types.manage'],
  'DELETE /trailer-types/:id/hard': ['trailer_types.manage'],
  'GET /limits': ['limits.manage'],
  'PUT /limits/:yearMonth': ['limits.manage'],
  'POST /limits/bulk': ['limits.manage'],
  'GET /audit': ['audit.read'],
  'GET /diagnostics/db': ['diagnostics.manage'],
  'GET /diagnostics/mails': ['diagnostics.manage'],
  'GET /diagnostics/claims': ['diagnostics.manage'],
  'POST /diagnostics/mails/:jobId/resend': ['diagnostics.manage'],
};

/**
 * Session-only routes (no `@RequirePermission`: any session passes) and why
 * they stay that way — the allowlist of the inverse rule: every non-`@Public`
 * route carries `@RequirePermission` or sits here (docs/25 R2).
 */
export const AUTHENTICATED_ONLY: Readonly<Record<string, string>> = {
  'GET /auth/me': 'Every signed-in user reads their own session profile.',
  'POST /auth/logout': 'Every signed-in user may end their own session.',
  'POST /auth/change-password':
    'Self-service and the forced change gate (mustChangePassword) — must work for every role.',
  'GET /trailer-types':
    'Read-only dictionary for vehicle/trailer forms of every panel; writes are trailer_types.manage.',
  'GET /integrations/bugbot/handoff':
    'Bug reports are open to every role; kind=idea is the bugbot.submit_idea capability checked in BugbotHandoffService.',
};

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
