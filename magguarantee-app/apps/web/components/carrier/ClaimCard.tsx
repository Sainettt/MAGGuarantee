'use client';

// Phase 3 — list item on `/carrier/claims`. Replaces legacy `.claim-card`
// (`index.html:419-426`). Per docs/14 § Phase 3 "<ClaimCard>" — top row
// with nrZgl + status + payment, then date range, then meta row, then an
// optional reklamacja indicator at the bottom.

import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ClaimListItem } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import {
  headlineAmount,
  MONEY_TONE_TEXT,
  moneyTone,
} from '@/lib/claims/money';
import { cn } from '@/lib/utils';

function formatDate(iso: string): string {
  // Wire dates are ISO; trim to dd.mm.yyyy. We deliberately don't pull
  // `date-fns` for one format — `Intl.DateTimeFormat` is built-in.
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatEur(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface ClaimCardProps {
  claim: ClaimListItem;
}

export function ClaimCard({ claim }: ClaimCardProps) {
  const t = useTranslations('carrier.claims');

  // Money hero — same rule as the detail page (§3.1B): once the verifier has
  // decided the claim, `amountApproved` is the ONLY truthful number. Before
  // that it is null and we show the km-calc `paymentEur` (what is being asked
  // for). Rendering `paymentEur` unconditionally made an accepted card display
  // the requested amount instead of the granted one whenever the verifier
  // corrected it. The label under the value says which of the two it is, so
  // the number is never ambiguous.
  const { value: amount, kind } = headlineAmount(claim);
  const tone = moneyTone(claim.status);

  return (
    <Link
      href={`/carrier/claims/${encodeURIComponent(claim.nrZgl)}`}
      className="block bg-card rounded-lg border border-border p-5 mb-3 transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
      aria-label={t('wniosekAria', { nrZgl: claim.nrZgl })}
    >
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-extrabold text-text font-mono">
            {claim.nrZgl}
          </span>
          <StatusBadge status={claim.status} />
        </div>
        <span className="flex flex-col items-end leading-none">
          <span
            className={cn(
              'text-xl font-extrabold tabular-nums whitespace-nowrap',
              MONEY_TONE_TEXT[tone],
            )}
          >
            {formatEur(amount)}{' '}
            <span className="text-sm font-bold text-text-sub">EUR</span>
          </span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-text-sub">
            {kind === 'approved'
              ? t('detail.moneyLabelApproved')
              : t('detail.moneyLabelCalc')}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm text-text-sub">
        <span>{formatDate(claim.dateStart)}</span>
        <ArrowRight size={12} aria-hidden />
        <span>{formatDate(claim.dateEnd)}</span>
      </div>

      <div className="border-t border-border my-3" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-text-sub">
        <div>
          {t('vehicleLabel')}:{' '}
          <span className="font-semibold text-text font-mono">
            {claim.vehiclePlate}
          </span>
        </div>
        {claim.kmGuaranteed != null && claim.mileage != null && (
          <div>
            {t('kmLabel')}:{' '}
            <span className="font-semibold text-text tabular-nums">
              {Math.round(claim.mileage)} / {Math.round(claim.kmGuaranteed)}
            </span>
          </div>
        )}
      </div>

      {claim.reklamacjaSubmitted && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-warning-bg text-warning-dark dark:bg-warning/15 dark:text-warning px-2 py-1 text-xs font-bold">
          <AlertTriangle size={12} aria-hidden />
          {t('reklamacjaIndicator')}
        </div>
      )}
    </Link>
  );
}
