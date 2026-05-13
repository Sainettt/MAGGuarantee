// Tiny relative-time formatter for the employee claims table "updated"
// column. Uses next-intl's translation map (`employee.claims.relative.*`)
// so PL / EN both work.
//
// We deliberately don't pull date-fns or Intl.RelativeTimeFormat — the
// three buckets we need (minutes / hours / days) can be expressed
// declaratively in the locale file with ICU MessageFormat plural rules.
//
// Returns a tuple `[messageKey, vars]` so callers can render via
// `t(key, vars)` keeping the component logic clean.

export type RelativeTimeKey =
  | 'employee.claims.relative.now'
  | 'employee.claims.relative.minutes'
  | 'employee.claims.relative.hours'
  | 'employee.claims.relative.days';

export function relativeTimeKey(
  iso: string | null | undefined,
  now: number = Date.now(),
): { key: RelativeTimeKey; vars: { n: number } | undefined } {
  if (!iso) return { key: 'employee.claims.relative.now', vars: undefined };
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) {
    return { key: 'employee.claims.relative.now', vars: undefined };
  }
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return { key: 'employee.claims.relative.now', vars: undefined };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return { key: 'employee.claims.relative.minutes', vars: { n: diffMin } };
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return { key: 'employee.claims.relative.hours', vars: { n: diffHour } };
  }
  const diffDay = Math.floor(diffHour / 24);
  return { key: 'employee.claims.relative.days', vars: { n: diffDay } };
}
