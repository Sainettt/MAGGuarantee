// Phase 4.5 — `<AuditRow>` per docs/14-design-system.md L805-815.
//
// Two variants:
//   - `default` (full row): used in the audit page itself but most of the
//     full-row UX (expand → JSON diff) actually lives in the audit page's
//     row-click → `<Sheet>` flow, which is more discoverable than an
//     inline expand panel for a long action verb + JSON pair. This file
//     ships only the small primitives the page composes.
//   - `compact` (dashboard sidebar): single line — initials + verb +
//     target + relative time. Height capped at 36px.

import { useTranslations } from 'next-intl';
import type { DashboardAuditRowSummary } from '@magguarantee/shared';

import { relativeTimeKey } from '@/lib/format/relative-time';
import { cn } from '@/lib/utils';

/** Deterministic, palette-bounded background from a string. */
function avatarBg(seed: string): string {
  // Tiny, hand-rolled hash — `for...of` over code points keeps the function
  // both fast and deterministic across re-renders (same input → same class).
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  const palette = [
    'bg-brand-50 text-brand-700 dark:bg-brand/20 dark:text-brand-200',
    'bg-info-bg text-info-dark dark:bg-info/15 dark:text-info',
    'bg-success-bg text-success-dark dark:bg-success/15 dark:text-success',
    'bg-warning-bg text-warning-dark dark:bg-warning/15 dark:text-warning',
    'bg-input text-text-sub',
  ];
  return palette[h % palette.length]!;
}

function initialsOf(login: string | null | undefined): string {
  if (!login) return '?';
  // First two characters of login uppercased — login is more stable than
  // a possibly-null full name and serves both audit + dashboard contexts.
  return login.slice(0, 2).toUpperCase();
}

export interface AuditRowCompactProps {
  row: DashboardAuditRowSummary;
}

/** Dashboard sidebar variant — single line, no avatar circle. */
export function AuditRowCompact({ row }: AuditRowCompactProps) {
  const t = useTranslations();
  const { key, vars } = relativeTimeKey(row.createdAt);
  const initials = initialsOf(row.userLogin);
  return (
    <li className="flex items-center gap-2 h-9 px-2 text-sm">
      <span
        aria-hidden
        className={cn(
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
          avatarBg(row.userLogin ?? row.id),
        )}
      >
        {initials}
      </span>
      <span className="flex-1 min-w-0 truncate text-text">
        <span className="font-semibold">{row.userLogin ?? '—'}</span>
        <span className="text-text-sub"> · {row.action}</span>
        {row.targetKey && (
          <span className="text-text-sub"> → {row.targetKey}</span>
        )}
      </span>
      <span
        className="shrink-0 text-xs text-text-sub tabular-nums"
        title={row.createdAt}
      >
        {t(key, vars)}
      </span>
    </li>
  );
}

export interface AuditRowAvatarProps {
  /** Login or any stable string used both as hash-seed and initials source. */
  login: string | null | undefined;
  className?: string;
}

/** Re-usable avatar bubble used inside the audit page's main table. */
export function AuditAvatar({ login, className }: AuditRowAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
        avatarBg(login ?? 'anonymous'),
        className,
      )}
    >
      {initialsOf(login)}
    </span>
  );
}
