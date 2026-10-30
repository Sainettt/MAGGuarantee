import type { AuditTargetType } from '@magguarantee/shared';

/**
 * Audit identity of the limits endpoints (docs/13 «Limits — `/api/v1/limits`»).
 *
 * `targetType` is `'WeeklyLimit'` since limits moved to ISO weeks (2026-10-29).
 * Rows written before that carry `'MonthlyLimit'`; both stay in the shared
 * `AUDIT_TARGET_TYPES`, so the `GET /audit?targetType=` filter keeps finding
 * the old rows. `satisfies` ties this literal to that list at compile time.
 */
export const LIMITS_AUDIT = {
  /** `PUT /limits/:isoWeek` — one week. `targetKey` = `2026-W23`. */
  update: 'limits.update',
  /** `POST /limits/bulk` — N weeks of one ISO year. `targetKey` = `2026-W10..W22`. */
  bulkUpdate: 'limits.bulkUpdate',
  targetType: 'WeeklyLimit' satisfies AuditTargetType,
} as const;
