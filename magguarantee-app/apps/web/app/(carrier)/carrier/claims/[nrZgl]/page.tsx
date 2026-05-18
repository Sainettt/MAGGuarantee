'use client';

// Phase 3 — claim detail (carrier view). Read-only, with a "Złóż reklamację"
// CTA gated by the same window the server enforces:
//   status ∈ {ZAAKCEPTOWANO, ODRZUCONO} AND !reklamacjaSubmitted AND
//   now() − statusChangedAt ≤ 48h.

import { ArrowLeft, ArrowRight, MessageSquareWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { BreakdownTable } from '@/components/carrier/BreakdownTable';
import { ReklamacjaSheet } from '@/components/carrier/ReklamacjaSheet';
import { StatusBadge } from '@/components/carrier/StatusBadge';
import { HoursReadout } from '@/components/claims/HoursReadout';
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
        {/* Top row — money hero on the left, claim meta on the right. The
            money value is always the same physical size; only color + label
            switch when the verifier flips the claim to ZAAKCEPTOWANO (see
            docs/14 §3.1B "no layout shift on status flip"). */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
          {/* LEFT — money hero */}
          <div className="flex flex-col gap-0.5">
            {claim.amountApproved != null ? (
              <>
                <div className="text-4xl md:text-5xl font-extrabold tabular-nums text-brand leading-none">
                  {formatEur(claim.amountApproved)} €
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-text-sub mt-1">
                  {tDetail('moneyLabelApproved')}
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl md:text-5xl font-extrabold tabular-nums text-text-sub leading-none">
                  {formatEur(claim.paymentEur)} €
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-text-sub mt-1">
                  {tDetail('moneyLabelCalc')}
                </div>
              </>
            )}
          </div>

          {/* RIGHT — meta block. Stays as a single column on mobile (below
              the money) so the StatusBadge never floats away from nrZgl. */}
          <div className="flex flex-col gap-1.5 md:items-end md:text-right">
            <div className="inline-flex items-center gap-2 flex-wrap md:justify-end">
              <span className="text-[15px] font-extrabold text-text font-mono">
                {claim.nrZgl}
              </span>
              <StatusBadge status={claim.status} />
            </div>
            <div className="text-sm text-text-sub tabular-nums">
              {tDetail('wniosekLabel')}:{' '}
              <b className="font-semibold text-text">
                {formatEur(claim.paymentEur)} €
              </b>
            </div>
            <div className="text-sm text-text-sub inline-flex items-center gap-1.5 flex-wrap md:justify-end">
              <span>{formatDate(claim.dateStart)}</span>
              <ArrowRight size={12} aria-hidden />
              <span>{formatDate(claim.dateEnd)}</span>
            </div>
            <HoursReadout
              rawTotalDays={claim.breakdown?.rawTotalDays ?? null}
              totalDays={claim.breakdown?.totalDays ?? null}
              className="md:items-end"
            />
          </div>
        </div>

        {/* Divider — separates the meta/money block from the factual
            vehicle row beneath. */}
        <div className="border-t border-border my-4" />

        {/* Vehicle facts — plate / mileage / km guaranteed in a single
            wrap-friendly row, label-muted + value-bold. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-text-sub">{tDetail('vehiclePlate')}:</span>{' '}
            <b className="font-semibold text-text font-mono">
              {claim.vehiclePlateSnapshot}
            </b>
          </div>
          <div>
            <span className="text-text-sub">{tDetail('mileage')}:</span>{' '}
            <b className="font-semibold text-text tabular-nums">
              {formatNum(claim.mileage)} km
            </b>
          </div>
          <div>
            <span className="text-text-sub">{tDetail('kmGuaranteed')}:</span>{' '}
            <b className="font-semibold text-text tabular-nums">
              {formatNum(claim.kmGuaranteed)} km
            </b>
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
