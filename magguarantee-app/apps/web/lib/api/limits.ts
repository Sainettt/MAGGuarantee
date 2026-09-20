// Phase 4.5 — typed API wrappers for /api/v1/limits/*.
//
// Admin-only on the server side. Year filter is mandatory per the
// `ListMonthlyLimitsFiltersSchema` contract. `PUT /limits/:yearMonth`
// upserts one row at a time; the UI sends a partial body (kmPerDay or
// ratePerKm, never both required) and Prisma upserts on `(year, month)`.

import type {
  BulkUpdateMonthlyLimitsDto,
  MonthlyLimitDto,
  MonthlyLimitListDto,
  UpdateMonthlyLimitDto,
} from '@magguarantee/shared';

import { apiJson } from './client';

export function listMonthlyLimits(year: number): Promise<MonthlyLimitListDto> {
  return apiJson<MonthlyLimitListDto>(`/limits?year=${year}`, {
    method: 'GET',
  });
}

/**
 * `PUT /limits/:yearMonth` — upsert a single row. The path carries the
 * `YYYY-MM` token; callers build it from a `{year, month}` pair via
 * `formatYearMonth()` so leading zeros stay consistent.
 */
export function updateMonthlyLimit(
  yearMonth: string,
  body: UpdateMonthlyLimitDto,
): Promise<MonthlyLimitDto> {
  return apiJson<MonthlyLimitDto>(`/limits/${encodeURIComponent(yearMonth)}`, {
    method: 'PUT',
    json: body,
  });
}

/**
 * `POST /limits/bulk` — apply ONE partial payload to several months of a
 * single year (admin). Atomic server-side: the whole month list and the audit
 * row commit in one transaction, so the caller only ever handles
 * success / error — never a partial write, never a per-row retry.
 *
 * An omitted key leaves that column untouched; `0` is a real value ("guarantee
 * switched off"). The body is never allowed to carry `null`.
 */
export function bulkUpdateMonthlyLimits(
  body: BulkUpdateMonthlyLimitsDto,
): Promise<MonthlyLimitListDto> {
  return apiJson<MonthlyLimitListDto>('/limits/bulk', {
    method: 'POST',
    json: body,
  });
}

/** `YYYY-MM` formatter — pads single-digit months with a leading zero. */
export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
