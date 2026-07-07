'use client';

// Phase 12 — carrier dashboard banner (docs/14 §12.2).
//
// One aggregate card that names every vehicle owed a zgłoszenie-wyjazdu and
// links to the report form. It is NOT one banner per vehicle — a carrier may
// have several guaranteed vehicles lapsing at once, so they roll up into a
// single calm card. Mounted at the top of the carrier claims list (the
// carrier's home surface) above the `<h1>`.
//
// Silence is the good state: when nothing is owed (`owed.length === 0`) the
// banner does not render at all — no green «wszystko OK» placeholder (§12.2,
// §7.6 empty-state principle). While the query is in flight it renders nothing
// either (a phantom red bar that vanishes is worse than a late one).
//
// Banner tone = the worst vehicle in it: red (`danger`) if ANY vehicle is
// `violated`, else amber (`warning`). Each per-vehicle row keeps its OWN chip
// severity, so an amber banner can host amber rows and a red banner both red
// and amber rows.
//
// CTA deep-links to `/carrier/delegations/new` — the zgłoszenie-wyjazdu form
// (NOT the wniosek/claim form). Reporting a wyjazd resolves the episode
// server-side; on the next `/me` refetch (invalidated by the delegation-submit
// mutation) the vehicle drops out of `owed` and the banner shrinks or vanishes.

import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo } from 'react';
import type { GuaranteeComplianceItem } from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { formatDateFull } from '@/lib/format/numbers';
import { compareByUrgency, isOwed } from '@/lib/guarantee';
import { useMyGuaranteeCompliance } from '@/lib/hooks/useGuarantee';
import { cn } from '@/lib/utils';

import { GuaranteeCountdownBadge } from './GuaranteeCountdownBadge';

/** Rows past this are collapsed behind a «+ N więcej» line (§12.2). */
const MAX_ROWS = 5;

export function GuaranteeReminderBanner() {
  const t = useTranslations('guarantee.banner');
  const tCountdown = useTranslations('guarantee.countdown');
  const { data } = useMyGuaranteeCompliance();

  const owed = useMemo(
    () => (data?.items ?? []).filter(isOwed).sort(compareByUrgency),
    [data],
  );

  // Nothing owed (or still loading) → render nothing. Silence is good.
  if (owed.length === 0) return null;

  const anyViolated = owed.some((v) => v.state === 'violated');
  const tone = anyViolated ? 'danger' : 'warning';
  const HeaderIcon = anyViolated ? AlertTriangle : Clock;

  const visible = owed.slice(0, MAX_ROWS);
  const hiddenCount = owed.length - visible.length;

  // Worded status for the per-row aria-label — same wording the chip shows.
  const rowStatus = (v: GuaranteeComplianceItem): string => {
    const d = v.daysLeft ?? 0;
    if (d < 0) return tCountdown('overdue', { days: Math.abs(d) });
    if (d === 0) return tCountdown('today');
    return tCountdown('dueSoon', { days: d });
  };

  return (
    <div
      className={cn(
        'rounded-xl border-l-4 p-4 mb-6',
        anyViolated
          ? 'border-danger bg-danger-bg/40 dark:bg-danger/10'
          : 'border-warning bg-warning-bg/40 dark:bg-warning/10',
      )}
      role="region"
      aria-label={t('title', { count: owed.length })}
    >
      {/* Header row — icon + ICU-plural count + primary CTA. */}
      <div className="flex flex-wrap items-center gap-3">
        <HeaderIcon
          size={16}
          className={tone === 'danger' ? 'text-danger' : 'text-warning'}
          aria-hidden
        />
        <p
          className={cn(
            'flex-1 text-sm font-bold',
            tone === 'danger' ? 'text-danger' : 'text-warning',
          )}
        >
          {t('title', { count: owed.length })}
        </p>
        <Link href="/carrier/delegations/new" className="shrink-0">
          <Button size="sm" className="min-h-[44px]">
            {t('cta')}
            <ArrowRight size={14} aria-hidden />
          </Button>
        </Link>
      </div>

      {/* Per-vehicle rows — most urgent first. Each row carries its own chip. */}
      <ul className="mt-3">
        {visible.map((v) => (
          <li
            key={v.vehicleId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm border-t border-border/60 first:border-t-0"
            aria-label={t('ariaRow', {
              plate: v.plateNumber,
              date: formatDateFull(v.deadlineAt),
              status: rowStatus(v),
            })}
          >
            <span className="font-mono font-semibold text-text">
              {v.plateNumber}
            </span>
            <span className="text-text-sub">
              · {v.sideNumber ?? '—'}
            </span>
            {v.deadlineAt ? (
              <span className="text-xs text-text-sub tabular-nums">
                {t('deadline', { date: formatDateFull(v.deadlineAt) })}
              </span>
            ) : null}
            <span className="ml-auto">
              <GuaranteeCountdownBadge daysLeft={v.daysLeft ?? 0} />
            </span>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 ? (
        <p className="mt-1 text-xs text-text-sub">
          {t('more', { count: hiddenCount })}
        </p>
      ) : null}
    </div>
  );
}
