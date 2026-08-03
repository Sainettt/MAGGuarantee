// Typed API wrapper for the Phase 5.2 document-expiry alerts surface.
//
// One endpoint backs the whole «Alerty» page:
//   * `GET /alerts` — every expiring/expired document (carrier OCP insurance +
//     transport licence, vehicle fuel card, driver licence) the caller may see,
//     pre-grouped by category and pre-classified into severity buckets.
//
// Role-gated server-side to admin (all) + opiekun (their carriers). In-app
// only — there is no email side. The client does not re-enforce ownership; the
// route-group layout gates by role and the API scopes by `Carrier.opiekunId`.

import type { AlertsResponse } from '@magguarantee/shared';

import { apiJson } from './client';

export function getAlerts(): Promise<AlertsResponse> {
  return apiJson<AlertsResponse>('/alerts', { method: 'GET' });
}
