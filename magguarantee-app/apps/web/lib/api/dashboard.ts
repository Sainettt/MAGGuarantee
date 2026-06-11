// Phase 4.3 — Dashboard wrapper.
//
// One-shot pull of the aggregated KPI / overdue / dueSoon / recent /
// topCarriers / monthlySeries / reklamacje payload. Backend computes
// everything in a single round-trip (`GET /diagnostics/dashboard`) — admin
// OR pracownik. The verification-SLA buckets (`overdue` / `dueSoon`, docs/21
// §4) replace the old single `urgent` list.

import type { DashboardDto } from '@magguarantee/shared';

import { apiJson } from './client';

export function getDashboard(): Promise<DashboardDto> {
  return apiJson<DashboardDto>('/diagnostics/dashboard', { method: 'GET' });
}
