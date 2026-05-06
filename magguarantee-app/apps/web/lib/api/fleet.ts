// Typed API wrappers for /api/v1/fleet/*.
//
// `GET /fleet/my` is the carrier-scoped aggregate that backs every form
// dropdown (vehicles / drivers / trailers) on the new-claim and
// new-delegation pages. The carrier identity is taken from the JWT.

import type { MyFleetResponse } from '@magguarantee/shared';

import { apiJson } from './client';

export function getMyFleet(): Promise<MyFleetResponse> {
  return apiJson<MyFleetResponse>('/fleet/my', { method: 'GET' });
}
