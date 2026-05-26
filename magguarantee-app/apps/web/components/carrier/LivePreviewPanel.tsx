'use client';

// Phase 3 — right-hand panel on /carrier/claims/new. Per docs/14 Phase 3 §
// <LivePreviewPanel>: 2x2 stat grid + BreakdownTable + skeleton/error/empty
// states. Server is the single source of truth — this component never
// recomputes anything client-side; it simply renders what the API returned.

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PreviewClaimResponse } from '@magguarantee/shared';

import { BreakdownTable } from '@/components/carrier/BreakdownTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

function formatInt(n: number): string {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n);
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

interface StatProps {
  label: string;
  value: React.ReactNode;
  /** Brand left-border accent (for paymentEur). */
  highlight?: boolean;
  /** Muted value (for negative kmDifference / no payout cases). */
  muted?: boolean;
}

function StatCard({ label, value, highlight, muted }: StatProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-lg border border-border p-4',
        highlight && 'border-l-4 border-l-brand pl-3',
      )}
    >
      <div className="text-xs font-bold uppercase tracking-wider text-text-sub">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-extrabold tabular-nums',
          muted ? 'text-text-sub' : 'text-text',
        )}
      >
        {value}
      </div>
    </div>
  );
}

export interface LivePreviewPanelProps {
  /** Last successful preview from the server. Null until first response. */
  data: PreviewClaimResponse | null | undefined;
  /** Server is fetching. */
  isLoading?: boolean;
  /** Server returned a 4xx/5xx for the current input. */
  isError?: boolean;
  /** Form is not yet filled enough to fire a preview. */
  isEmpty?: boolean;
  /**
   * When `isEmpty` is true, optionally name the reason so the panel can
   * render a specific empty-state instead of the generic "fill in fields"
   * placeholder. Recognized values:
   *  - 'incomplete' (default) — required fields missing
   *  - 'date-order' — dateStart > dateEnd
   *  - 'mileage-zero' — mileage must be > 0
   */
  emptyReason?: 'incomplete' | 'date-order' | 'mileage-zero';
}

export function LivePreviewPanel({
  data,
  isLoading,
  isError,
  isEmpty,
  emptyReason,
}: LivePreviewPanelProps) {
  const t = useTranslations('carrier.preview');
  // Empty state wins over loading — if the form is half-filled we don't
  // want to flash a skeleton just because the user is typing. The reason
  // disambiguates between "form not filled yet" and "form is filled but
  // semantically wrong" (date-order, mileage=0) — particularly important
  // for date-order, where the preview would otherwise vanish silently
  // while the user is mid-edit.
  if (isEmpty && !data) {
    let message: string;
    switch (emptyReason) {
      case 'date-order':
        message = t('empty.dateOrder');
        break;
      case 'mileage-zero':
        message = t('empty.mileageZero');
        break;
      case 'incomplete':
      default:
        message = t('empty.incomplete');
        break;
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-card rounded-lg border border-border p-8 text-center text-sm text-text-sub">
          {message}
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-card rounded-lg border border-border">
          <EmptyState
            icon={AlertTriangle}
            title={t('errorTitle')}
            message={t('errorMessage')}
          />
        </div>
      </div>
    );
  }

  // Either the first request hasn't returned yet, or we're refreshing.
  // When `data` exists we render it; otherwise show a full skeleton.
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-card rounded-lg border border-border p-4"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-32" />
            </div>
          ))}
        </div>
        <div className="bg-card rounded-lg border border-border p-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  const noPayout = data.kmDifference < 0;

  return (
    <div className="flex flex-col gap-4 relative">
      {isLoading && (
        <div
          className="absolute right-2 top-2 flex items-center gap-1.5 text-xs text-text-sub"
          aria-live="polite"
        >
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {t('updating')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t('kmGuaranteed')}
          value={formatInt(data.kmGuaranteed)}
        />
        <StatCard
          label={t('kmDifference')}
          value={formatInt(data.kmDifference)}
          muted={noPayout}
        />
        <StatCard
          label={t('ratePerKm')}
          value={new Intl.NumberFormat('pl-PL', {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(data.ratePerKmEffective)}
        />
        <StatCard
          label={t('paymentEur')}
          value={
            <>
              {formatEur(data.paymentEur)}{' '}
              <span className="text-sm font-bold text-text-sub">€</span>
            </>
          }
          highlight
          muted={noPayout}
        />
      </div>

      <BreakdownTable breakdown={data.breakdown} />
    </div>
  );
}
