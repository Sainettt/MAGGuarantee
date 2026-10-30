'use client';

// Phase 3 — claim detail (carrier view). Read-only, with a "Złóż reklamację"
// CTA gated by the SHARED eligibility predicate (`getReklamacjaEligibility` in
// `@magguarantee/shared`, the very helper the api enforces):
//   decided ∧ !reklamacjaSubmitted ∧ maxAmount > 0 ∧ within 48h of the decision.
//
// REWORK 2026-07-31 (docs/14 §"Reklamacja sheet" + §"…outcome block"):
//   - the CTA slot holds the button OR a muted dead-end line OR nothing — never
//     a disabled button (§6.5.13);
//   - a decided reklamacja is invisible in the status (the wniosek rolls back to
//     `statusBeforeReklamacja`), so the outcome lives in <ReklamacjaOutcome>;
//   - the money hero gains a third state, «wypłacono łącznie», for an uznana
//     reklamacja — `amountApproved` alone is then the WRONG number (and is
//     `null` outright when the wniosek itself was rejected).

import { ArrowLeft, ArrowRight, Clock, Info, MessageSquareWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { getReklamacjaEligibility } from '@magguarantee/shared';

import { BreakdownTable } from '@/components/carrier/BreakdownTable';
import { ReklamacjaOutcome } from '@/components/carrier/ReklamacjaOutcome';
import { ReklamacjaSheet } from '@/components/carrier/ReklamacjaSheet';
import { StatusBadge } from '@/components/carrier/StatusBadge';
import { HoursReadout } from '@/components/claims/HoursReadout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  headlineAmount,
  MONEY_TONE_TEXT,
  moneyTone,
  verifierMovedAmount,
} from '@/lib/claims/money';
import { carrierNote, decisionNote } from '@/lib/claims/claimNotes';
import { classifyApiError } from '@/lib/api/errors';
import { useClaim } from '@/lib/hooks/useClaims';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import { cn } from '@/lib/utils';

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
  const tReklamacja = useTranslations('carrier.reklamacja');
  const params = useParams<{ nrZgl: string }>();
  const nrZgl = decodeURIComponent(params.nrZgl);
  const claimQ = useClaim(nrZgl);
  const { data: claim, isLoading } = claimQ;
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) {
    return (
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }

  // A failed load (network / 5xx / 403) is NOT "not found" — only a 404 is.
  if (!claim && claimQ.isError && classifyApiError(claimQ.error) !== 'notFound') {
    return (
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-card rounded-lg border border-border">
          <ErrorState {...queryErrorProps(claimQ)} />
        </div>
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

  // Reklamacja gating — THE shared predicate (never a local re-derivation; the
  // two copies that used to exist had already drifted apart).
  const eligibility = getReklamacjaEligibility(
    {
      status: claim.status,
      origPaymentEur: claim.origPaymentEur,
      paymentEur: claim.paymentEur,
      amountApproved: claim.amountApproved,
      reklamacjaSubmitted: claim.reklamacjaSubmitted,
      statusChangedAt: claim.statusChangedAt,
    },
    new Date(),
  );
  const requestedForHint = claim.origPaymentEur ?? claim.paymentEur;

  const origMoved = verifierMovedAmount(claim);

  // Who wrote what (UWAGI #4): the carrier's own submit note vs MAGTRANS's
  // decision justification — two rows, two treatments, never one «Komentarz».
  const ownNote = carrierNote(claim);
  const magtransNote = decisionNote(claim);

  // ── Money hero — three states, ONE typographic slot (no layout shift) ──
  // «Wypłacono łącznie» wins whenever the reklamacja was uznana: either part of
  // the sum may be 0/null (a rejected wniosek with an uznana reklamacja pays
  // ONLY the reklamacja).
  const headline = headlineAmount(claim);
  const totalPaid =
    claim.reklamacjaResolution === 'UZNANA'
      ? (claim.amountApproved ?? 0) + (claim.reklamacjaAmount ?? 0)
      : null;
  const heroValue = totalPaid ?? headline.value;
  const heroLabel =
    totalPaid != null
      ? tDetail('moneyLabelTotalPaid')
      : headline.kind === 'approved'
        ? tDetail('moneyLabelApproved')
        : tDetail('moneyLabelCalc');
  // Money tone stays STATUS-driven (`lib/claims/money.ts`) — except for the
  // total, which is money actually granted, so it takes the granted tone even
  // when the wniosek's own status is «Odrzucono».
  const heroTone =
    totalPaid != null
      ? MONEY_TONE_TEXT.approved
      : MONEY_TONE_TEXT[moneyTone(claim.status)];

  // ── The CTA slot (button | muted dead-end line | nothing) ──
  // Same slot for all states so the card's bottom edge never reflows. An
  // already-filed reklamacja renders NOTHING here — the outcome block is the
  // explanation.
  const reklamacjaSlot = eligibility.canFile ? (
    <Button type="button" size="sm" onClick={() => setSheetOpen(true)}>
      <MessageSquareWarning size={14} />
      {tDetail('submitReklamacja')}
    </Button>
  ) : eligibility.blockedReason === 'WINDOW_EXPIRED' ? (
    <p className="inline-flex items-center gap-1.5 text-xs text-text-sub">
      <Clock size={12} aria-hidden />
      {tReklamacja('deadlinePassed')}
    </p>
  ) : eligibility.blockedReason === 'NO_DELTA' ? (
    <p
      className="inline-flex items-center gap-1.5 text-xs text-text-sub"
      title={tReklamacja('noDeltaTitle', {
        requested: formatEur(requestedForHint),
        // Derived from the shared ceiling so the printed pair always explains
        // the verdict (a rejected wniosek counts as «paid 0» by definition,
        // whatever a stale `amountApproved` says).
        paid: formatEur(requestedForHint - eligibility.maxAmount),
      })}
    >
      <Info size={12} aria-hidden />
      {/* Two copies: «paid covers the whole request» reads absurdly when
          nothing was ever requested (guarantee met ⇒ origPaymentEur = 0). */}
      {requestedForHint > 0
        ? tReklamacja('noDelta')
        : tReklamacja('noDeltaZero')}
    </p>
  ) : null;

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
          {/* LEFT — money hero. Tone comes from the STATUS (green = granted,
              red = refused, neutral = undecided), never from the size of the
              number; see `lib/claims/money.ts`. */}
          <div className="flex flex-col gap-0.5">
            <div
              className={cn(
                'text-4xl md:text-5xl font-extrabold tabular-nums leading-none',
                heroTone,
              )}
            >
              {formatEur(heroValue)} €
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-text-sub mt-1">
              {heroLabel}
            </div>
            {/* Addends of the total — so «wypłacono łącznie» is never an
                unexplained number. */}
            {totalPaid != null && (
              <div className="text-xs text-text-sub tabular-nums">
                {tDetail('totalBreakdown', {
                  approved: formatEur(claim.amountApproved ?? 0),
                  reklamacja: formatEur(claim.reklamacjaAmount ?? 0),
                })}
              </div>
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
            {/* The money chain. «Wnioskowano» is the frozen submit-time figure
                and appears ONLY when the verifier actually moved it — on the
                vast majority of wnioski the two are equal and printing both
                would be noise. Legacy rows have no snapshot at all, and
                `verifierMovedAmount` returns false for them rather than
                inventing one. */}
            {origMoved && (
              <div className="text-sm text-text-sub tabular-nums">
                {tDetail('moneyRequested')}:{' '}
                <b className="font-semibold text-text line-through decoration-text-sub/50">
                  {formatEur(claim.origPaymentEur)} €
                </b>
              </div>
            )}
            <div className="text-sm text-text-sub tabular-nums">
              {/* «Wnioskowano» is claimed for this number ONLY when we can
                  prove it — i.e. the snapshot exists and matches. On a legacy
                  row (`origPaymentEur === null`) we do not know what was
                  originally asked, so the neutral «Po weryfikacji» is used: it
                  is true of `paymentEur` unconditionally. */}
              {claim.origPaymentEur != null && !origMoved
                ? tDetail('moneyRequested')
                : tDetail('moneyAfterVerification')}
              :{' '}
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

        {reklamacjaSlot && (
          <div className="mt-6 flex items-center justify-end">
            {reklamacjaSlot}
          </div>
        )}
      </div>

      {claim.breakdown && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub mb-2">
            {tDetail('weeklyBreakdown')}
          </h2>
          <BreakdownTable breakdown={claim.breakdown} />
        </div>
      )}

      <div
        className={cn(
          'bg-card rounded-lg border border-border p-6',
          // The outcome card follows this one — keep them apart.
          claim.reklamacjaSubmitted && 'mb-6',
        )}
      >
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub mb-4">
          {tDetail('details')}
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-text-sub">{tDetail('submittedAt')}</dt>
            <dd className="mt-0.5 text-text">{formatDate(claim.createdAt)}</dd>
          </div>
          {(claim.status === 'ZAAKCEPTOWANO' ||
            claim.status === 'ODRZUCONO') &&
            claim.statusChangedAt && (
              <div>
                <dt className="text-text-sub">{tDetail('decidedAt')}</dt>
                <dd className="mt-0.5 text-text">
                  {formatDate(claim.statusChangedAt)}
                </dd>
              </div>
            )}
          {/* The full chain, spelled out. Unlike the header (which hides the
              original when it did not move), this block always states what was
              asked for — `formatEur` renders an em-dash for the legacy rows
              that have no snapshot, which is the honest answer: we genuinely
              do not know what those carriers originally asked for. */}
          <div>
            <dt className="text-text-sub">{tDetail('amountRequested')}</dt>
            <dd className="mt-0.5 tabular-nums font-semibold text-text">
              {claim.origPaymentEur != null
                ? `${formatEur(claim.origPaymentEur)} €`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-text-sub">{tDetail('amountApproved')}</dt>
            <dd className="mt-0.5 tabular-nums font-semibold text-text">
              {claim.amountApproved != null
                ? `${formatEur(claim.amountApproved)} €`
                : '—'}
            </dd>
          </div>
          {/* Row 3b — the sum, deliberately AFTER its two addends so the money
              rows read as arithmetic top-to-bottom. Not tinted: the tone is
              carried by the outcome block's chip + banner below. */}
          {totalPaid != null && (
            <div>
              <dt className="text-text-sub">{tDetail('totalPaid')}</dt>
              <dd className="mt-0.5 tabular-nums font-semibold text-text">
                {`${formatEur(totalPaid)} €`}
              </dd>
            </div>
          )}
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
          {/* Row 6 — «Twój komentarz»: the carrier's OWN submit note, plain. */}
          {ownNote != null && (
            <div className="sm:col-span-2">
              <dt className="text-text-sub">{tDetail('comment')}</dt>
              <dd className="mt-0.5 text-text whitespace-pre-wrap">
                {ownNote}
              </dd>
            </div>
          )}
          {/* Row 6b — MAGTRANS's justification of the decision: «Uzasadnienie
              MAGTRANS» (accepted) / «Powód odrzucenia» (rejected), by the
              pre-reklamacja verdict while a reklamacja is open. On the muted
              quoted surface so it never reads as the carrier's own text. */}
          {magtransNote != null && (
            <div className="sm:col-span-2">
              <dt className="text-text-sub">{tDetail(magtransNote.labelKey)}</dt>
              <dd className="mt-1 whitespace-pre-wrap rounded-md bg-input/40 p-3 text-text">
                {magtransNote.text}
              </dd>
            </div>
          )}
          {/* Former rows 7–8 (reklamacja text / response) REMOVED 2026-07-31 —
              they live in <ReklamacjaOutcome> below, once. */}
        </dl>
      </div>

      {/* Reklamacja outcome — the ONLY place the outcome is visible (the status
          badge above says nothing about it by design). */}
      <ReklamacjaOutcome claim={claim} />

      <ReklamacjaSheet
        open={sheetOpen}
        claim={claim}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
