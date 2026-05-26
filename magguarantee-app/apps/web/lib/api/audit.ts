// Phase 4.5 — typed API wrappers for /api/v1/audit + /api/v1/lookups/users.
//
// Read-only, admin-only. Cursor-based pagination per the AuditFiltersSchema;
// the response envelope is `{items, nextCursor}` matching the rest of the
// listing endpoints.

import type {
  AuditFilters,
  AuditLogListDto,
  LookupUserAdminFilters,
  LookupUserAdminListDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { toQuery } from './query';

export function listAudit(
  filters: Partial<AuditFilters> = {},
): Promise<AuditLogListDto> {
  // `AuditFilters` carries `limit: number` with a default of 50 baked into
  // the Zod schema; we leave `limit` undefined here so the server applies
  // the default when not explicitly set by the UI.
  const qs = toQuery({
    targetType: filters.targetType,
    targetKey: filters.targetKey,
    userId: filters.userId,
    action: filters.action,
    from: filters.from,
    to: filters.to,
    cursor: filters.cursor,
    limit: filters.limit,
  });
  return apiJson<AuditLogListDto>(`/audit${qs}`, { method: 'GET' });
}

/**
 * Admin-only user autocomplete used by the audit-filter sidebar. Returns
 * compact `{id, login, name, role, active}` rows; the API caps the result at
 * 100 entries so the picker can render without pagination.
 */
export function listLookupUsersAdmin(
  filters: LookupUserAdminFilters = {},
): Promise<LookupUserAdminListDto> {
  return apiJson<LookupUserAdminListDto>(
    `/lookups/users${toQuery({ q: filters.q })}`,
    { method: 'GET' },
  );
}
