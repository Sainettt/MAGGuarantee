// Typed API wrappers for the Phase 5 opiekun-scoped surface.
//
// Two endpoints back the opieka panel:
//   * `GET /fleet/opiekun`     — per-carrier fleet aggregates (4-bucket
//     vehicle classification + totals strip). Backs the main `/employee/opieka`
//     dashboard table.
//   * `GET /opiekun/carriers`  — lighter identity + active-child counts only.
//     Kept for nav / sidebar use-cases where the heavier classification isn't
//     needed.
//
// Both are role-gated server-side to `admin` (sees every carrier) and
// `opiekun` (sees only carriers where `Carrier.opiekunId === user.sub`). The
// client does not re-enforce ownership — the route-group layout already
// gates by role and the API filters by ownership.

import type {
  OpiekunCarriersResponse,
  OpiekunFleetResponse,
} from '@magguarantee/shared';

import { apiJson } from './client';

export function getOpiekunFleet(): Promise<OpiekunFleetResponse> {
  return apiJson<OpiekunFleetResponse>('/fleet/opiekun', { method: 'GET' });
}

export function getOpiekunCarriers(): Promise<OpiekunCarriersResponse> {
  return apiJson<OpiekunCarriersResponse>('/opiekun/carriers', {
    method: 'GET',
  });
}
