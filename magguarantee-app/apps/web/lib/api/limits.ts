// Phase 4.5 — typed API wrappers for /api/v1/limits/*.
//
// Admin-only on the server side. Year filter is mandatory per the
// `ListMonthlyLimitsFiltersSchema` contract. `PUT /limits/:yearMonth`
// upserts one row at a time; the UI sends a partial body (kmPerDay or
// ratePerKm, never both required) and Prisma upserts on `(year, month)`.

import type {
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

/** `YYYY-MM` formatter — pads single-digit months with a leading zero. */
export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
