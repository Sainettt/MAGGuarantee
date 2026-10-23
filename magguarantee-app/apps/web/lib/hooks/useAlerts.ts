'use client';

// TanStack Query hook for the document-expiry alerts.
//
// Read-only aggregate derived live from carriers/vehicles/drivers. Because the
// classification is computed against "today" server-side, the data goes stale
// at the day boundary — a 5-minute `staleTime` keeps it fresh enough without
// hammering the endpoint, and the sidebar badge shares this cache with the
// page (same key → one request).

import { useQuery } from '@tanstack/react-query';

import { getAlerts } from '@/lib/api/alerts';

export const ALERTS_KEY = ['alerts'] as const;

interface UseAlertsOptions {
  /** Gate the query — the sidebar passes `useCan('panel.opiekun')` (admin + opiekun). */
  enabled?: boolean;
}

export function useAlerts(options: UseAlertsOptions = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ALERTS_KEY,
    queryFn: getAlerts,
    enabled,
    staleTime: 5 * 60_000,
  });
}
