'use client';

// Phase 12 — shared episode-archive history (docs/14 §12.7).
//
// The durable violation journal, rendered as a mobile-first STACKED list (not a
// wide DataTable — the carrier tab is card-shaped). One component, all states
// shown (warning / violated / resolved), newest first, cursor «Załaduj więcej».
// Purely presentational: the parent owns the query + pagination (the carrier tab
// wires `useMyGuaranteeEpisodes`; a future opiekun drill-down can pass a
// carrier-scoped feed) — that keeps ownership out of this shell and lets both
// surfaces share it without a role branch.
//
// Silence is the good state: an empty archive is a *positive* signal (no missed
// deadline), so it uses a calm success icon, never an alarming shell.

import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { GuaranteeEpisodeDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateFull } from '@/lib/format/numbers';
import { cn } from '@/lib/utils';

interface GuaranteeEpisodeHistoryProps {
  items: GuaranteeEpisodeDto[];
  isLoading: boolean;
  /** True while a «Załaduj więcej» page is in flight. */
  isFetchingMore?: boolean;
  /** Whether a next cursor page exists. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Opiekun drill-down only: show the fired-reminder micro-line (§12.7). */
  showReminders?: boolean;
  /**
   * Opiekun drill-down only (§12.7): also render the internal `sideNumber` and
   * the carrier name alongside the plate. Defaults **off** so the internal
   * designation can never leak onto the carrier tab by omission — the carrier
   * feed always shows `plateNumber` only.
   */
  showSideNumber?: boolean;
  className?: string;
}

/** Episode state → <Badge> variant (text + colour, never colour alone). */
const STATE_VARIANT = {
  warning: 'warning',
  violated: 'danger',
  resolved: 'success',
} as const;

export function GuaranteeEpisodeHistory({
  items,
  isLoading,
  isFetchingMore = false,
  hasMore = false,
  onLoadMore,
  showReminders = false,
  showSideNumber = false,
  className,
}: GuaranteeEpisodeHistoryProps) {
  const t = useTranslations('guarantee.episodes');
  const tAnchor = useTranslations('guarantee.porozumienie');

  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        iconClassName="text-success"
        title={t('empty')}
        className={className}
      />
    );
  }

  const anchorLine = (row: GuaranteeEpisodeDto): string =>
    row.anchorSource === 'agreement'
      ? tAnchor('anchor.agreement', { date: formatDateFull(row.anchorAt) })
      : tAnchor('anchor.zjechal', { date: formatDateFull(row.anchorAt) });

  return (
    <div className={cn('space-y-2', className)}>
      <ul className="space-y-2">
        {items.map((row) => (
          <li
            key={row.id}
            className="rounded-md border border-border bg-card px-3 py-2"
          >
            {/* Header — identity + state pill. `plateNumber` always (mono);
                the internal `sideNumber` + carrier name only on the opiekun
                drill-down (`showSideNumber`), never on the carrier tab. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono font-semibold text-text">
                {row.plateNumber ?? '—'}
                {showSideNumber && row.sideNumber ? (
                  <span className="ml-1 font-sans font-normal text-text-sub">
                    · {row.sideNumber}
                  </span>
                ) : null}
              </span>
              {showSideNumber && row.carrierName ? (
                <span className="text-xs text-text-sub">
                  {row.carrierName}
                </span>
              ) : null}
              <span className="ml-auto">
                <Badge variant={STATE_VARIANT[row.state]}>
                  {t(`state.${row.state}`)}
                </Badge>
              </span>
            </div>

            {/* Body — anchor + deadline. */}
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-text-sub tabular-nums sm:flex-row sm:gap-3">
              <span>{anchorLine(row)}</span>
              <span>{tAnchor('deadline', { date: formatDateFull(row.deadlineAt) })}</span>
            </div>

            {/* Resolution — only for resolved episodes. */}
            {row.state === 'resolved' && row.resolvedAt ? (
              <p className="mt-1 text-xs font-medium text-success tabular-nums">
                {t('resolvedAt', {
                  date: formatDateFull(row.resolvedAt),
                  reason: row.resolvedReason
                    ? t(`reason.${row.resolvedReason}`)
                    : '—',
                })}
              </p>
            ) : null}

            {/* Reminders — opiekun drill-down only (noise on the carrier tab). */}
            {showReminders ? (
              <p className="mt-1 text-xs text-text-sub">
                {t('reminders', {
                  d3: row.reminder3SentAt ? '✓' : '—',
                  d1: row.reminder1SentAt ? '✓' : '—',
                })}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isFetchingMore}
          >
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
