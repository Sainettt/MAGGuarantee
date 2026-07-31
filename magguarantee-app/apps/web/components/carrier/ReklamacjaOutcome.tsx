'use client';

// REWORK 2026-07-31 — carrier claim-detail reklamacja outcome card.
// Spec: docs/14 §"Reklamacja — carrier claim-detail outcome block" (authoritative).
//
// WHY THIS EXISTS. A decided reklamacja is no longer visible in the claim
// status — the wniosek returns to `statusBeforeReklamacja` for BOTH outcomes, so
// `<StatusBadge>` looks exactly as it did before the complaint. The outcome is
// data-only (`reklamacjaResolution`, `null` = pending), so it needs its own
// surface: this card + the shared <ReklamacjaResolutionChip>.
//
// Rendered ONLY when `claim.reklamacjaSubmitted === true`, below the «Szczegóły»
// <dl> card. The card fill stays neutral (`bg-card`) — the TONE lives in the
// inner state banner, so it never competes with the money hero above.
//
// `reklamacjaText` / `reklamacjaResponse` were REMOVED from the «Szczegóły» <dl>
// (former rows 7–8): they live here, once.

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ClaimDto } from '@magguarantee/shared';

import { ReklamacjaResolutionChip } from '@/components/claims/ReklamacjaResolutionChip';
import { cn } from '@/lib/utils';

/** `dd.MM.yyyy` — date-only, same treatment as every other date on the page. */
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

/** `1 234,56` — the page renders the «€» suffix itself. */
function formatEur(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface ReklamacjaOutcomeProps {
  claim: ClaimDto;
  className?: string;
}

export function ReklamacjaOutcome({ claim, className }: ReklamacjaOutcomeProps) {
  const t = useTranslations('carrier.claims.detail.reklamacjaOutcome');

  // Hard visibility gate — the block is the reklamacja's only home on this page.
  if (!claim.reklamacjaSubmitted) return null;

  const resolution = claim.reklamacjaResolution;

  // One banner, tone by resolution. The PENDING recipe is the <ClaimCard>
  // warning-indicator recipe verbatim (same tokens, same <AlertTriangle>) so
  // «reklamacja w toku» reads identically on the list and on the detail page.
  const banner =
    resolution === 'UZNANA'
      ? {
          tone: 'bg-success-bg text-success-dark dark:bg-success/15 dark:text-success',
          Icon: CheckCircle2,
          text: t('bannerUznana', { amount: formatEur(claim.reklamacjaAmount) }),
        }
      : resolution === 'ODRZUCONA'
        ? {
            tone: 'bg-danger-bg text-danger-dark dark:bg-danger/15 dark:text-danger',
            Icon: XCircle,
            // The REASON is a <dl> row, never the banner — a 500-char
            // justification inside a tinted banner is unreadable.
            text: t('bannerOdrzucona'),
          }
        : {
            tone: 'bg-warning-bg text-warning-dark dark:bg-warning/15 dark:text-warning',
            Icon: AlertTriangle,
            text: t('bannerPending'),
          };

  const BannerIcon = banner.Icon;

  return (
    <section
      className={cn(
        'bg-card rounded-lg border border-border p-5 mb-6',
        className,
      )}
      aria-label={t('title')}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-text">{t('title')}</h2>
        <ReklamacjaResolutionChip resolution={resolution} />
      </div>

      <p
        className={cn(
          'flex items-start gap-2 rounded-md px-3 py-2 text-sm',
          banner.tone,
        )}
        role="status"
      >
        <BannerIcon size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>{banner.text}</span>
      </p>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-4">
        {/* 1 — kwota reklamacji (always). This is the amount paid on UZNANA. */}
        <div>
          <dt className="text-xs uppercase tracking-wider text-text-sub">
            {t('amount')}
          </dt>
          <dd className="mt-0.5 tabular-nums font-semibold text-text">
            {claim.reklamacjaAmount != null
              ? `${formatEur(claim.reklamacjaAmount)} €`
              : '—'}
          </dd>
        </div>

        {/* 2 — data zgłoszenia (omitted when unknown, never an em-dash row) */}
        {claim.reklamacjaSubmittedAt && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-sub">
              {t('submittedAt')}
            </dt>
            <dd className="mt-0.5 text-text">
              {formatDate(claim.reklamacjaSubmittedAt)}
            </dd>
          </div>
        )}

        {/* 3 — treść (always) */}
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wider text-text-sub">
            {t('text')}
          </dt>
          <dd className="mt-0.5 text-text whitespace-pre-wrap">
            {claim.reklamacjaText ?? '—'}
          </dd>
        </div>

        {/* 4 — nr zlecenia: only on UZNANA and only when non-empty. May
            legitimately be absent (the staff prefill can start empty). */}
        {resolution === 'UZNANA' && claim.reklamacjaOrderNumber && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-sub">
              {t('orderNumber')}
            </dt>
            <dd className="mt-0.5 font-mono text-text">
              {claim.reklamacjaOrderNumber}
            </dd>
          </div>
        )}

        {/* 5 — data rozpatrzenia: only once decided */}
        {resolution !== null && claim.reklamacjaDecidedAt && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-text-sub">
              {t('decidedAt')}
            </dt>
            <dd className="mt-0.5 text-text">
              {formatDate(claim.reklamacjaDecidedAt)}
            </dd>
          </div>
        )}

        {/* 6 — odpowiedź / powód: only when non-empty */}
        {claim.reklamacjaResponse && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wider text-text-sub">
              {t('response')}
            </dt>
            <dd className="mt-0.5 text-text whitespace-pre-wrap">
              {claim.reklamacjaResponse}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export default ReklamacjaOutcome;
