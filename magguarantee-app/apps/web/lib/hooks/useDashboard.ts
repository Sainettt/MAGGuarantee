'use client';

// TanStack Query hook for the employee dashboard aggregate. One-shot query
// returns all sections (kpi / overdue / dueSoon / recent / topCarriers /
// monthlySeries / reklamacje) so we don't fan out into parallel queries
// from a single page. 60s staleTime matches the dashboard refresh cadence
// implied by docs/14 § DashboardSidebar (`each section refetches
// independently` is in spec for Phase 5+; Phase 4.3 ships a single endpoint).

import { useQuery } from '@tanstack/react-query';

import { getDashboard } from '@/lib/api/dashboard';

export const DASHBOARD_KEY = ['dashboard'] as const;

export function useDashboard() {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: getDashboard,
    staleTime: 60_000,
  });
}
