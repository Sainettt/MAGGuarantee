'use client';

// Phase 3 — claim detail (carrier view). Read-only, with a "Złóż reklamację"
// CTA gated by the same window the server enforces:
//   status ∈ {ZAAKCEPTOWANO, ODRZUCONO} AND !reklamacjaSubmitted AND
//   now() − statusChangedAt ≤ 48h.

import { ArrowLeft, MessageSquareWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { BreakdownTable } from '@/components/carrier/BreakdownTable';
import { ReklamacjaSheet } from '@/components/carrier/ReklamacjaSheet';
import { StatusBadge } from '@/components/carrier/StatusBadge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useClaim } from '@/lib/hooks/useClaims';

const REKLAMACJA_WINDOW_MS = 48 * 60 * 60 * 1000;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
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

function formatNum(n: number | null, frac = 0): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  }).format(n);
}

function formatEur(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function ClaimDetailPage() {
  const t = useTranslations('carrier.claims');
  const tDetail = useTranslations('carrier.claims.detail');
  const tForm = useTranslations('carrier.claims.form');
  const params = useParams<{ nrZgl: string }>();
  const nrZgl = decodeURIComponent(params.nrZgl);
  const { data: claim, isLoading } = useClaim(nrZgl);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) {
    return (
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }

  if (!claim) {
    return (
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <EmptyState
          title={t('notFoundTitle')}
          message={t('notFoundMessage')}
          action={
            <Link href="/carrier/claims">
              <Button variant="ghost" size="sm">
                <ArrowLeft size={14} />
                {t('backToList')}
              </Button>
            </Link>
          }
        />
      </section>
    );
  }

  // Reklamacja gating — mirror the server check exactly.
  const canSubmitReklamacja = (() => {
    if (claim.reklamacjaSubmitted) return false;
    if (claim.status !== 'ZAAKCEPTOWANO' && claim.status !== 'ODRZUCONO')
      return false;
    if (!claim.statusChangedAt) return false;
    const ageMs = Date.now() - new Date(claim.statusChangedAt).getTime();
    return ageMs <= REKLAMACJA_WINDOW_MS;
  })();

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4">
        <Link
          href="/carrier/claims"
          className="inline-flex items-center gap-1 text-sm text-text-sub hover:text-text"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
      </div>

      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[15px] font-extrabold text-text font-mono">
              {claim.nrZgl}
            </div>
            <div className="text-sm text-text-sub mt-1">
              {formatDate(claim.dateStart)} → {formatDate(claim.dateEnd)}
            </div>
          </div>
          <StatusBadge status={claim.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-sub">
              {tForm('vehicle')}
            </div>
            <div className="mt-1 font-mono font-semibold text-text">
              {claim.vehiclePlateSnapshot}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-sub">
              {tDetail('mileage')}
            </div>
            <div className="mt-1 tabular-nums font-semibold text-text">
              {formatNum(claim.mileage)} km
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-sub">
              {tDetail('kmGuaranteed')}
            </div>
            <div className="mt-1 tabular-nums font-semibold text-text">
              {formatNum(claim.kmGuaranteed)} km
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-sub">
              {tDetail('payment')}
            </div>
            <div className="mt-1 tabular-nums font-extrabold text-text">
              {formatEur(claim.paymentEur)} €
            </div>
          </div>
        </div>

        {canSubmitReklamacja && (
          <div className="mt-6 flex items-center justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => setSheetOpen(true)}
            >
              <MessageSquareWarning size={14} />
              {tDetail('submitReklamacja')}
            </Button>
          </div>
        )}
      </div>

      {claim.breakdown && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub mb-2">
            {tDetail('monthlyBreakdown')}
          </h2>
          <BreakdownTable breakdown={claim.breakdown} />
        </div>
      )}

      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub mb-4">
          {tDetail('details')}
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-text-sub">{tDetail('amountRequested')}</dt>
            <dd className="mt-0.5 tabular-nums font-semibold text-text">
              {formatEur(claim.amountRequested)} €
            </dd>
          </div>
          <div>
            <dt className="text-text-sub">{tDetail('amountApproved')}</dt>
            <dd className="mt-0.5 tabular-nums font-semibold text-text">
              {formatEur(claim.amountApproved)} €
            </dd>
          </div>
          {claim.orderNumber && (
            <div>
              <dt className="text-text-sub">{tDetail('orderNumber')}</dt>
              <dd className="mt-0.5 font-mono text-text">
                {claim.orderNumber}
              </dd>
            </div>
          )}
          {claim.orderDate && (
            <div>
              <dt className="text-text-sub">{tDetail('orderDate')}</dt>
              <dd className="mt-0.5 text-text">{formatDate(claim.orderDate)}</dd>
            </div>
          )}
          {claim.comment && (
            <div className="sm:col-span-2">
              <dt className="text-text-sub">{tDetail('comment')}</dt>
              <dd className="mt-0.5 text-text whitespace-pre-wrap">
                {claim.comment}
              </dd>
            </div>
          )}
          {claim.reklamacjaSubmitted && claim.reklamacjaText && (
            <div className="sm:col-span-2">
              <dt className="text-text-sub">{tDetail('reklamacjaText')}</dt>
              <dd className="mt-0.5 text-text whitespace-pre-wrap">
                {claim.reklamacjaText}
              </dd>
            </div>
          )}
          {claim.reklamacjaResponse && (
            <div className="sm:col-span-2">
              <dt className="text-text-sub">{tDetail('reklamacjaResponse')}</dt>
              <dd className="mt-0.5 text-text whitespace-pre-wrap">
                {claim.reklamacjaResponse}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <ReklamacjaSheet
        open={sheetOpen}
        claim={claim}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
