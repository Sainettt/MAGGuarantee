'use client';

// TanStack Query hooks for /audit + /lookups/users (admin-only).
//
// The list query keys on the full filter object so cursor pagination works:
// each "next page" is a distinct key (cursor changes), and clearing a filter
// resets to the page-1 cache. Lookups query is debounced on the consumer
// side and cached for 5 min — the user roster barely changes mid-session.

import { useQuery } from '@tanstack/react-query';
import type { AuditFilters } from '@magguarantee/shared';

import { listAudit, listLookupUsersAdmin } from '@/lib/api/audit';

export const AUDIT_KEY = ['audit'] as const;
export const LOOKUP_USERS_KEY = ['lookups', 'usersAdmin'] as const;

export function useAudit(filters: Partial<AuditFilters> = {}) {
  return useQuery({
    queryKey: [...AUDIT_KEY, 'list', filters],
    queryFn: () => listAudit(filters),
    staleTime: 15_000,
  });
}

export function useLookupUsersAdmin(q?: string) {
  return useQuery({
    queryKey: [...LOOKUP_USERS_KEY, q ?? ''],
    queryFn: () =>
      listLookupUsersAdmin(q && q.trim() ? { q: q.trim() } : {}),
    staleTime: 5 * 60_000,
  });
}
