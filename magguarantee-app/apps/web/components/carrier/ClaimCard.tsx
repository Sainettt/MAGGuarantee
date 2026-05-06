'use client';

// Phase 3 — list item on `/carrier/claims`. Replaces legacy `.claim-card`
// (`index.html:419-426`). Per docs/14 § Phase 3 "<ClaimCard>" — top row
// with nrZgl + status + payment, then date range, then meta row, then an
// optional reklamacja indicator at the bottom.

import { AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ClaimListItem } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';

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
  return (
    <Link
      href={`/carrier/claims/${encodeURIComponent(claim.nrZgl)}`}
      className="block bg-card rounded-lg border border-border p-5 mb-3 transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
      aria-label={`Wniosek ${claim.nrZgl}`}
    >
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-extrabold text-text font-mono">
            {claim.nrZgl}
          </span>
          <StatusBadge status={claim.status} />
        </div>
        <span className="text-xl font-extrabold text-text tabular-nums whitespace-nowrap">
          {formatEur(claim.paymentEur)}{' '}
          <span className="text-sm font-bold text-text-sub">EUR</span>
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
          Pojazd:{' '}
          <span className="font-semibold text-text font-mono">
            {claim.vehiclePlate}
          </span>
        </div>
        {claim.kmGuaranteed != null && claim.mileage != null && (
          <div>
            Km:{' '}
            <span className="font-semibold text-text tabular-nums">
              {Math.round(claim.mileage)} / {Math.round(claim.kmGuaranteed)}
            </span>
          </div>
        )}
      </div>

      {claim.reklamacjaSubmitted && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-warning-bg text-warning-dark dark:bg-warning/15 dark:text-warning px-2 py-1 text-xs font-bold">
          <AlertTriangle size={12} aria-hidden />
          Reklamacja zgłoszona
        </div>
      )}
    </Link>
  );
}
