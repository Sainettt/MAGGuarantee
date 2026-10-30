// Typed API wrappers for /api/v1/limits/* — km limits per ISO week since
// 2026-10-29 (docs/13 «Limits», docs/14 §18).
//
// Admin-only on the server side.
//   • `GET /limits?year=` — `year` is the ISO YEAR; returns only the weeks that
//     have a `weekly_limits` row. The calendar fills the rest in from
//     `isoWeeksOfYear` (`@magguarantee/shared`).
//   • `PUT /limits/:isoWeek` (`YYYY-Www`) — upsert ONE week with a partial body
//     (only the field that changed).
//   • `POST /limits/bulk` — one partial payload on N weeks of one ISO year,
//     atomic.
// An omitted key leaves that column untouched; `0` is a real value
// ("guarantee switched off"). No body is ever allowed to carry `null`.

import type {
  BulkUpdateWeeklyLimitsDto,
  UpdateWeeklyLimitDto,
  WeeklyLimitDto,
  WeeklyLimitListDto,
} from '@magguarantee/shared';

import { apiJson } from './client';

export function listWeeklyLimits(isoYear: number): Promise<WeeklyLimitListDto> {
  return apiJson<WeeklyLimitListDto>(`/limits?year=${isoYear}`, {
    method: 'GET',
  });
}

/**
 * `PUT /limits/:isoWeek` — upsert a single week. The path carries the
 * `YYYY-Www` key; callers build it with `formatIsoWeekKey` (shared) so the
 * two-digit week stays consistent with the server's `IsoWeekParamSchema`.
 */
export function updateWeeklyLimit(
  isoWeekKey: string,
  body: UpdateWeeklyLimitDto,
): Promise<WeeklyLimitDto> {
  return apiJson<WeeklyLimitDto>(`/limits/${encodeURIComponent(isoWeekKey)}`, {
    method: 'PUT',
    json: body,
  });
}

/**
 * `POST /limits/bulk` — apply ONE partial payload to several weeks of a single
 * ISO year (admin). Atomic server-side: every upsert and the audit row commit
 * in one transaction, so the caller only ever handles success / error — never
 * a partial write, never a per-row retry. Returns the affected rows.
 */
export function bulkUpdateWeeklyLimits(
  body: BulkUpdateWeeklyLimitsDto,
): Promise<WeeklyLimitListDto> {
  return apiJson<WeeklyLimitListDto>('/limits/bulk', {
    method: 'POST',
    json: body,
  });
}
