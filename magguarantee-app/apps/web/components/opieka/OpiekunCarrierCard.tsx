// Phase 5.2 — card-grid redesign for the «Moja Opieka» carrier list.
//
// Replaces the 8-column DataTable row with a fluid card that survives narrow
// sidebar / tablet widths without horizontal scroll.
//
// Anatomy / colour tokens / hover & focus rules match docs/14-design-system.md
// § Phase 5.2 — no new design tokens introduced. Reuses the existing semantic
// palette (`text-success` / `text-warning` / `text-danger` / `text-info`) so
// the colour story mirrors the KPI strip above on the same page.
//
// §15 — the card now has TWO click targets, so it can no longer be one big
// `<Link>` (nesting anchors is invalid HTML). Instead the card is a plain
// container carrying the hover/`group` chrome, with:
//   - a STRETCHED link (`absolute inset-0`) covering the whole card → the
//     carrier drill-down, exactly the old whole-card behaviour, and
//   - four stat links stacked above it (`relative z-10`) → the vehicles list
//     filtered to THIS carrier + that lifecycle bucket.
// The focus ring lives on the stretched link itself, so keyboard focus still
// outlines the whole card.

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  OpiekunCarrierStats,
  VehicleLifecycleStatus,
} from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { vehiclesListHref } from '@/lib/vehicles-filter';

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
  /** Drill-down target — the vehicles list filtered to this carrier + bucket. */
  href: string;
  /** Spells out what the number means and where the link goes. */
  ariaLabel: string;
}

function StatCell({ value, label, tone, href, ariaLabel }: StatCellProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        // `relative z-10` lifts the cell above the card's stretched link so the
        // narrower target wins the click. Padding stays INSIDE the grid track
        // (the row itself is pulled out by `-mx-1`) so neighbouring hit areas
        // touch but never overlap.
        'relative z-10 flex flex-col items-start gap-0.5 min-w-0 rounded-md px-1 py-1',
        'transition-colors hover:bg-input',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
      )}
    >
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
    </Link>
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
  const tVehStatus = useTranslations('vehicleStatus');

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
    <div
      data-inactive={isInactive || undefined}
      className={cn(
        'group relative flex flex-col gap-3 p-4 sm:p-5',
        'bg-card border border-border rounded-lg',
        'transition-[background-color,border-color,box-shadow] duration-150',
        // `:hover` on the container also fires while the pointer is over an
        // inner stat link — the whole card lighting up is the intent.
        'hover:shadow-card hover:border-brand/40 hover:bg-brand-50/30 dark:hover:bg-brand/5',
        'data-[inactive=true]:opacity-70',
      )}
    >
      {/* Stretched whole-card link — the carrier drill-down (unchanged target).
          It sits BELOW the stat links (`z-0`), so they take precedence. */}
      <Link
        href={`/employee/opieka/carriers/${encodeURIComponent(carrier.login)}`}
        aria-label={t('table.openDetailAria', { firma: displayName })}
        className={cn(
          'absolute inset-0 z-0 rounded-lg',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
        )}
      />
      {/* Headline row — firma + active badge. */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {/* No `title` here: the stretched link paints above static content,
              so a native tooltip on the heading would never fire. The full name
              stays reachable as the link's accessible name + the drill-down. */}
          <h3 className="font-semibold text-text text-[15px] leading-tight truncate">
            {displayName}
          </h3>
          <span className="text-xs text-text-sub font-mono truncate">
            {carrier.login}
          </span>
        </div>
        <div className="flex flex-none items-center gap-2">
          {needsAttention && (
            <span
              // Lifted above the stretched link so its reason tooltip still
              // fires — a 16px informational marker, small enough that the card
              // stays clickable everywhere it matters.
              className="relative z-10 inline-flex items-center text-warning-dark dark:text-warning"
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
      <div className="grid grid-cols-4 gap-2 -mx-1">
        {STATS.map(({ status, key, tone }) => {
          const value = carrier.vehicles[key];
          const label = t(`card.${key}`);
          return (
            <StatCell
              key={status}
              value={value}
              label={label}
              tone={tone}
              href={vehiclesListHref({ status, carrierId: carrier.carrierId })}
              ariaLabel={t('card.statAria', {
                label: tVehStatus(`${status}.tile`),
                count: value,
                firma: displayName,
              })}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * The four idle-clock buckets shown on the card, in ramp order. `key` indexes
 * the aggregate counts (and doubles as the `opieka.card.*` label key); `status`
 * is the canonical lifecycle value the vehicles list filters on. `wylaczona` is
 * orthogonal and stays off the card (§6.3.6).
 */
const STATS: readonly {
  status: VehicleLifecycleStatus;
  key: 'aktywne' | 'stojace' | 'nieaktywne' | 'doUsuniecia';
  tone: Tone;
}[] = [
  { status: 'aktywna', key: 'aktywne', tone: 'success' },
  { status: 'stojaca', key: 'stojace', tone: 'neutral' },
  { status: 'nieaktywna', key: 'nieaktywne', tone: 'warning' },
  { status: 'do_usuniecia', key: 'doUsuniecia', tone: 'danger' },
];

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
