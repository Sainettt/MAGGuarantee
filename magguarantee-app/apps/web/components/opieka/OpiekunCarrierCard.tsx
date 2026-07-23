// Phase 5.2 — card-grid redesign for the «Moja Opieka» carrier list.
//
// Replaces the 8-column DataTable row with a fluid card that survives narrow
// sidebar / tablet widths without horizontal scroll. The whole card is the
// click target (a single `<Link>` from `next/link`) — no inner action button.
//
// Anatomy / colour tokens / hover & focus rules match docs/14-design-system.md
// § Phase 5.2 — no new design tokens introduced. Reuses the existing semantic
// palette (`text-success` / `text-warning` / `text-danger` / `text-info`) so
// the colour story mirrors the KPI strip above on the same page.

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { OpiekunCarrierStats } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-text-sub',
};

interface StatCellProps {
  value: number;
  label: string;
  tone: Tone;
}

function StatCell({ value, label, tone }: StatCellProps) {
  return (
    <div className="flex flex-col items-start gap-0.5 min-w-0">
      <span
        className={cn(
          'text-2xl font-extrabold tabular-nums leading-none',
          TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-sub truncate w-full">
        {label}
      </span>
    </div>
  );
}

export interface OpiekunCarrierCardProps {
  carrier: OpiekunCarrierStats;
}

export default function OpiekunCarrierCard({
  carrier,
}: OpiekunCarrierCardProps) {
  const t = useTranslations('opieka');
  const tCommon = useTranslations('common');

  const displayName = carrier.firma ?? carrier.nazwa ?? carrier.login;
  const isInactive = carrier.aktywny === false;

  // "Requires attention" marker — the sole reason today is an incomplete fleet
  // (missing vehicle / trailer / driver). The opiekun (unlike the carrier) sees
  // the breakdown, surfaced as the tooltip/`title` text.
  const reasons = carrier.attentionReasons ?? [];
  const needsAttention = reasons.length > 0;
  const reasonText = reasons
    .map((r) => t(`attention.reason.${r}`))
    .join(' · ');

  return (
    <Link
      href={`/employee/opieka/carriers/${encodeURIComponent(carrier.login)}`}
      aria-label={t('table.openDetailAria', { firma: displayName })}
      data-inactive={isInactive || undefined}
      className={cn(
        'group flex flex-col gap-3 p-4 sm:p-5',
        'bg-card border border-border rounded-lg',
        'transition-[background-color,border-color,box-shadow] duration-150',
        'hover:shadow-card hover:border-brand/40 hover:bg-brand-50/30 dark:hover:bg-brand/5',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:border-brand/60',
        'data-[inactive=true]:opacity-70',
      )}
    >
      {/* Headline row — firma + active badge. */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <h3
            className="font-semibold text-text text-[15px] leading-tight truncate"
            title={displayName}
          >
            {displayName}
          </h3>
          <span className="text-xs text-text-sub font-mono truncate">
            {carrier.login}
          </span>
        </div>
        <div className="flex flex-none items-center gap-2">
          {needsAttention && (
            <span
              className="inline-flex items-center text-warning-dark dark:text-warning"
              title={`${t('attention.title')}: ${reasonText}`}
              aria-label={`${t('attention.title')}: ${reasonText}`}
            >
              <TriangleAlert size={16} aria-hidden />
            </span>
          )}
          <Badge variant={carrier.aktywny ? 'success' : 'muted'}>
            {carrier.aktywny ? tCommon('active') : tCommon('inactive')}
          </Badge>
        </div>
      </div>

      {/* Meta row — NIP. */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('table.nip')}
        </span>
        <span className="font-mono tabular-nums text-text">{carrier.nip}</span>
      </div>

      {/* Divider. */}
      <div className="border-t border-border" />

      {/* Vehicle idle-clock stat-row — the 4 delegation-driven states (§6.3.6).
          `stojaca` is NEUTRAL (calm), not amber; the amber slot moves to
          `nieaktywna` («Długo stojąca»). `wylaczona` is orthogonal and not
          shown on the card (surfaced only in the drill-down table badge). */}
      <dl className="grid grid-cols-4 gap-2">
        <StatCell
          value={carrier.vehicles.aktywne}
          label={t('card.aktywne')}
          tone="success"
        />
        <StatCell
          value={carrier.vehicles.stojace}
          label={t('card.stojace')}
          tone="neutral"
        />
        <StatCell
          value={carrier.vehicles.nieaktywne}
          label={t('card.nieaktywne')}
          tone="warning"
        />
        <StatCell
          value={carrier.vehicles.doUsuniecia}
          label={t('card.doUsuniecia')}
          tone="danger"
        />
      </dl>
    </Link>
  );
}

/**
 * Card-shaped skeleton used while `useOpiekunFleet` is loading. Six instances
 * are rendered inside the same grid container as the real cards so the page
 * reserves space without layout jump when the data arrives. Anatomy mirrors
 * `<OpiekunCarrierCard>` to keep the perceived loading shape honest.
 */
export function OpiekunCarrierCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-32" />
      <div className="border-t border-border" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, j) => (
          <div key={j} className="flex flex-col gap-1">
            <Skeleton className="h-7 w-8" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
