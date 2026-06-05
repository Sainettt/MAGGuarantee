'use client';

// Phase 4.6 — <ClaimDetailModal>. Read-only sister of <ClaimVerificationModal>
// for admin / pracownik: row-click on /employee/claims opens this; the
// «Edytuj» footer button escalates to the existing verification modal. Mirrors
// the Vehicle / Trailer detail-modal pattern (docs/14 §6.9–§6.15) — composes
// the generic <EntityDetailModal> rather than re-rolling the surface.
//
// Data: re-uses `useClaim(nrZgl)` from lib/hooks/useClaims.ts (already wired
// into <ClaimVerificationModal>; cache key matches so opening the same claim
// twice doesn't double-fetch). The modal is rendered with `open={false}` until
// a row is selected, but the underlying query is `enabled: Boolean(nrZgl)` so
// the network call only fires on first open.
//
// Read-only values are <dd> text nodes (§6.5, §6.12) — never disabled inputs.
// Conditional sections (decision / authorization / reklamacja / attachments /
// comment) are simply pushed onto the `sections` array when the underlying
// claim flag/field is populated.

import {
  Calculator,
  ExternalLink,
  FileText,
  Gavel,
  History,
  MessageSquare,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ClaimAttachmentDto, ClaimDto } from '@magguarantee/shared';

import { BreakdownTable } from '@/components/carrier/BreakdownTable';
import { StatusBadge } from '@/components/carrier/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  dateValue,
  emptyValue,
  monoValue,
  textValue,
} from '@/components/ui/entity-detail-values';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateFull, formatDateTime, formatEur } from '@/lib/format/numbers';
import { useClaim } from '@/lib/hooks/useClaims';

interface ClaimDetailModalProps {
  open: boolean;
  nrZgl: string | null;
  onClose: () => void;
  /** Forwarded to the generic «Edytuj» action — caller opens the existing
   *  <ClaimVerificationModal>. Omit it for read-only consumers (e.g. future
   *  opiekun): the «Edytuj» button is then not rendered (§6.6). */
  onEdit?: () => void;
}

export function ClaimDetailModal({
  open,
  nrZgl,
  onClose,
  onEdit,
}: ClaimDetailModalProps) {
  // The hook is keyed on nrZgl + cached for the modal lifetime; closing the
  // modal does NOT cancel the in-flight request (cheap, GET endpoint, the
  // user is likely to reopen the same row on a misclick).
  const { data: claim, isLoading, isError, refetch } = useClaim(
    open ? nrZgl : null,
  );

  // When the parent isn't asking for the modal we render nothing — avoids
  // mounting an invisible <Dialog open={false}> that would still consume a
  // portal slot on every parent render.
  if (!open) return null;

  // Loaded happy-path — the <EntityDetailModal> takes over.
  if (claim && !isError) {
    return (
      <ClaimDetailContent
        open={open}
        claim={claim}
        onClose={onClose}
        onEdit={onEdit}
      />
    );
  }

  // Error state — surface a retry inside a bare <Dialog>. Checked BEFORE the
  // loading branch so a stale `isLoading=true` during refetch doesn't mask
  // the previous error.
  if (isError) {
    return (
      <ClaimDetailError open={open} onClose={onClose} onRetry={() => refetch()} />
    );
  }

  // Loading / refetching with no cached data — light skeleton in a bare
  // <Dialog>. `isLoading` is true on first fetch; the `!claim` guard catches
  // the in-between tick where the hook just enabled but hasn't started yet.
  void isLoading;
  return <ClaimDetailSkeleton open={open} onClose={onClose} />;
}

// ─── Loaded content ──────────────────────────────────────────────────────

interface ClaimDetailContentProps {
  open: boolean;
  claim: ClaimDto;
  onClose: () => void;
  onEdit?: () => void;
}

function ClaimDetailContent({
  open,
  claim,
  onClose,
  onEdit,
}: ClaimDetailContentProps) {
  const t = useTranslations('employee.claimDetail');
  const tDetail = useTranslations('entityDetail');
  const tStatus = useTranslations('carrier.claims.status');

  // ── Header ────────────────────────────────────────────────────────
  const title: ReactNode = (
    <span className="font-mono">{claim.nrZgl}</span>
  );
  const carrierName =
    claim.carrier?.name ?? claim.carrier?.login ?? claim.carrierId;
  const plate = claim.vehiclePlateSnapshot;
  const subtitle: ReactNode = (
    <span>
      {carrierName}
      {plate ? (
        <>
          {' · '}
          <span className="font-mono">{plate}</span>
        </>
      ) : null}
    </span>
  );
  const badges: ReactNode = <StatusBadge status={claim.status} />;

  // ── Numeric helpers — right-aligned, monospace, em-dash on null ──
  const km = (v: number | null | undefined): ReactNode => {
    if (v == null || !Number.isFinite(v)) return emptyValue();
    return (
      <span className="tabular-nums">
        {Math.round(v).toLocaleString('pl-PL')} km
      </span>
    );
  };
  const eur = (v: number | null | undefined): ReactNode => (
    <span className="tabular-nums">{formatEur(v)}</span>
  );
  const rate = (v: number | null | undefined): ReactNode => {
    if (v == null || !Number.isFinite(v)) return emptyValue();
    return (
      <span className="tabular-nums">
        {new Intl.NumberFormat('pl-PL', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(v)}
      </span>
    );
  };
  const num = (v: number | null | undefined, frac = 0): ReactNode => {
    if (v == null || !Number.isFinite(v)) return emptyValue();
    return (
      <span className="tabular-nums">
        {new Intl.NumberFormat('pl-PL', {
          minimumFractionDigits: frac,
          maximumFractionDigits: frac,
        }).format(v)}
      </span>
    );
  };

  // ── 1. Podstawowe dane ────────────────────────────────────────────
  const sections: EntityDetailSection[] = [
    {
      title: t('sections.basics'),
      icon: Truck,
      rows: [
        { label: t('fields.carrier'), value: textValue(carrierName) },
        { label: t('fields.vehicle'), value: monoValue(plate) },
        // `dateStart` / `dateEnd` are stored as ISO datetimes but render as
        // pure dates — the period bounds are calendar days, the time-of-day
        // info lives in `timeFrom` / `timeTo`.
        {
          label: t('fields.dateStart'),
          value: dateValue(claim.dateStart),
        },
        {
          label: t('fields.dateEnd'),
          value: dateValue(claim.dateEnd),
        },
        { label: t('fields.timeFrom'), value: textValue(claim.timeFrom) },
        { label: t('fields.timeTo'), value: textValue(claim.timeTo) },
        { label: t('fields.drivenDays'), value: num(claim.drivenDays, 2) },
      ],
    },
    // ── 2. Wyliczenia (km-calc) ──────────────────────────────────────
    {
      title: t('sections.calc'),
      icon: Calculator,
      rows: [
        { label: t('fields.mileage'), value: km(claim.mileage) },
        { label: t('fields.kmPerDay'), value: num(claim.kmPerDay) },
        { label: t('fields.kmGuaranteed'), value: km(claim.kmGuaranteed) },
        {
          label: t('fields.kmDifference'),
          value: km(claim.kmDifference),
        },
        {
          label: t('fields.ratePerKmEffective'),
          value: rate(claim.ratePerKmEffective),
        },
        { label: t('fields.paymentEur'), value: eur(claim.paymentEur) },
      ],
    },
  ];

  // ── 3. Breakdown (per month) ─ only when present ──────────────────
  if (claim.breakdown) {
    sections.push({
      title: t('sections.breakdown'),
      icon: Calculator,
      // The section spans both modal columns (`span: 'full'`) AND its single
      // row is `fullWidth` so the <BreakdownTable> gets the ENTIRE section
      // width — no 11rem label gutter. The table then container-queries
      // itself into the 5-col table layout (§6.20, § BreakdownTable). The
      // label is sr-only (the table reads as its own block, not a label pair).
      span: 'full',
      rows: [
        {
          label: t('sections.breakdown'),
          value: <BreakdownTable breakdown={claim.breakdown} />,
          fullWidth: true,
        },
      ],
    });
  }

  // ── 4. Decyzja ─ only past NA_WERYFIKACJI ─────────────────────────
  if (claim.status !== 'NA_WERYFIKACJI') {
    const decidedActor =
      claim.decidedBy?.name ??
      claim.decidedBy?.login ??
      claim.decidedById ??
      undefined;
    sections.push({
      title: t('sections.decision'),
      icon: Gavel,
      rows: [
        { label: t('fields.decidedBy'), value: textValue(decidedActor) },
        {
          label: t('fields.statusChangedAt'),
          value: claim.statusChangedAt
            ? formatDateTime(claim.statusChangedAt)
            : emptyValue(),
        },
        { label: t('fields.orderNumber'), value: monoValue(claim.orderNumber) },
        { label: t('fields.orderDate'), value: dateValue(claim.orderDate) },
        { label: t('fields.amountRequested'), value: eur(claim.amountRequested) },
        { label: t('fields.amountApproved'), value: eur(claim.amountApproved) },
        { label: t('fields.amountMaximum'), value: eur(claim.amountMaximum) },
        { label: t('fields.margin'), value: eur(claim.margin) },
      ],
    });
  }

  // ── 5. Autoryzacja ─ only when required ──────────────────────────
  if (claim.authorizationRequired) {
    sections.push({
      title: t('sections.authorization'),
      icon: ShieldCheck,
      rows: [
        {
          label: t('fields.authorizationDescription'),
          value: claim.authorizationDescription ? (
            <span className="whitespace-pre-wrap">
              {claim.authorizationDescription}
            </span>
          ) : (
            emptyValue()
          ),
        },
        {
          label: t('fields.authorizationDecidedAt'),
          value: claim.authorizationDecidedAt
            ? formatDateTime(claim.authorizationDecidedAt)
            : emptyValue(),
        },
        { label: t('fields.amountMaximum'), value: eur(claim.amountMaximum) },
      ],
    });
  }

  // ── 6. Historia reklamacji ─ only when reklamacjaSubmitted ───────
  if (claim.reklamacjaSubmitted) {
    sections.push({
      title: t('sections.reklamacjaHistory'),
      icon: History,
      rows: [
        // Status before reklamacja — render via the status-label namespace
        // so it stays in PL/EN sync with the StatusBadge in the header.
        {
          label: t('fields.statusBeforeReklamacja'),
          value: claim.statusBeforeReklamacja ? (
            <span>
              {tStatus.has(claim.statusBeforeReklamacja)
                ? tStatus(claim.statusBeforeReklamacja)
                : claim.statusBeforeReklamacja}
            </span>
          ) : (
            emptyValue()
          ),
        },
        {
          label: t('fields.reklamacjaText'),
          value: claim.reklamacjaText ? (
            <span className="whitespace-pre-wrap">{claim.reklamacjaText}</span>
          ) : (
            emptyValue()
          ),
        },
        {
          label: t('fields.reklamacjaResponse'),
          value: claim.reklamacjaResponse ? (
            <span className="whitespace-pre-wrap">
              {claim.reklamacjaResponse}
            </span>
          ) : (
            emptyValue()
          ),
        },
        {
          label: t('fields.reklamacjaAmount'),
          value: eur(claim.reklamacjaAmount),
        },
        // ── Originalne dane vs skorygowane ──
        // Each row is its own "before → after" pair with a strikethrough +
        // muted style on the original. We render them as paired rows so the
        // shell's two-column grid keeps them visually adjacent.
        {
          label: t('fields.origDateStart'),
          value: (
            <OrigVsCurrent
              orig={
                claim.origDateStart != null
                  ? formatDateFull(claim.origDateStart)
                  : null
              }
              current={formatDateFull(claim.dateStart)}
            />
          ),
        },
        {
          label: t('fields.origDateEnd'),
          value: (
            <OrigVsCurrent
              orig={
                claim.origDateEnd != null
                  ? formatDateFull(claim.origDateEnd)
                  : null
              }
              current={formatDateFull(claim.dateEnd)}
            />
          ),
        },
        {
          label: t('fields.origMileage'),
          value: (
            <OrigVsCurrent
              orig={
                claim.origMileage != null
                  ? `${Math.round(claim.origMileage).toLocaleString('pl-PL')} km`
                  : null
              }
              current={`${Math.round(claim.mileage).toLocaleString('pl-PL')} km`}
            />
          ),
        },
        // Hours adjustment — show only when the verifier actually diverged
        // from the carrier's submission; otherwise a 0→0 / 5.5→5.5 row is
        // visual noise (same reasoning as ClaimVerificationModal's history
        // tab).
        ...(claim.origHoursAdjusted !== null &&
        claim.origHoursAdjusted !== claim.hoursAdjustedValue
          ? [
              {
                label: t('fields.origHoursAdjusted'),
                value: (
                  <OrigVsCurrent
                    orig={`${claim.origHoursAdjusted} h`}
                    current={`${claim.hoursAdjustedValue ?? 0} h`}
                  />
                ),
              },
            ]
          : []),
      ],
    });
  }

  // ── 7. Załączniki ─ only when attachments[].length > 0 ──────────
  if (claim.attachments.length > 0) {
    sections.push({
      title: t('sections.attachments'),
      icon: FileText,
      rows: claim.attachments.map((att, idx) => ({
        label: monoValue(formatAttachmentLabel(att, idx)),
        value: (
          <AttachmentRowValue
            attachment={att}
            openLabel={t('attachments.open')}
          />
        ),
      })),
    });
  }

  // ── 8. Komentarz ─ only when non-empty ──────────────────────────
  const commentTrimmed = claim.comment?.trim();
  if (commentTrimmed) {
    sections.push({
      title: t('sections.comment'),
      icon: MessageSquare,
      rows: [
        {
          label: <span className="sr-only">{t('sections.comment')}</span>,
          value: (
            <span className="whitespace-pre-wrap text-sm text-text">
              {commentTrimmed}
            </span>
          ),
        },
      ],
    });
  }

  // ── Footer meta — created / updated timestamps (§6.6) ─────────────
  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(claim.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(claim.updatedAt)}
    </>
  );

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={title}
      subtitle={subtitle}
      badges={badges}
      sections={sections}
      meta={meta}
      onEdit={onEdit}
    />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Original-vs-current value rendered side-by-side. Mirrors the diff style
 * used in <ClaimVerificationModal>'s History tab so the two surfaces feel
 * like the same record. When `orig` is null/blank — no override — we
 * collapse to the current value only.
 */
function OrigVsCurrent({
  orig,
  current,
}: {
  orig: string | null;
  current: string;
}) {
  const changed = orig != null && orig !== current;
  if (orig == null) {
    return <span>{current}</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span
        className={
          changed ? 'text-text-sub line-through' : 'text-text-sub'
        }
      >
        {orig}
      </span>
      <span
        className={
          changed
            ? 'inline-block rounded-sm bg-warning/10 px-1.5 py-0.5 font-semibold text-text'
            : 'text-text'
        }
      >
        {current}
      </span>
    </div>
  );
}

interface AttachmentRowValueProps {
  attachment: ClaimAttachmentDto;
  openLabel: string;
}

/**
 * Attachment row — "Otwórz" link that opens the `url` field of the DTO in
 * a new tab. ClaimAttachmentDto exposes a direct URL (signed in production)
 * so we don't need a separate fetcher hook the way VehicleDetailModal does.
 * Size + mime type are surfaced as a small caption next to the icon.
 */
function AttachmentRowValue({
  attachment,
  openLabel,
}: AttachmentRowValueProps) {
  const sizeLabel =
    attachment.size != null && Number.isFinite(attachment.size)
      ? formatFileSize(attachment.size)
      : null;
  // The <Button> primitive renders a native <button> and doesn't expose
  // `asChild`, so the link is a plain styled <a> that mirrors the
  // ghost-sm visual treatment used elsewhere for attachment links
  // (focus ring + hover bg + 14px caret icon — see Vehicle/Trailer
  // AttachmentRowValue for the precedent).
  return (
    <div className="flex items-center gap-2">
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${openLabel} — ${attachment.url}`}
        className="-mx-2 inline-flex max-w-full items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] font-bold text-text hover:bg-input focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
      >
        <ExternalLink size={14} aria-hidden className="shrink-0" />
        <span className="truncate">{openLabel}</span>
      </a>
      {sizeLabel != null ? (
        <span className="text-xs text-text-sub tabular-nums">{sizeLabel}</span>
      ) : null}
    </div>
  );
}

function formatAttachmentLabel(
  att: ClaimAttachmentDto,
  idx: number,
): string {
  // ClaimAttachmentDto carries a URL + mime, no fileName field. We surface a
  // short, stable identifier (`#N · mime`) so the row label is readable even
  // when the URL is a long signed S3 path.
  const mime = att.mimeType?.trim();
  return mime ? `#${idx + 1} · ${mime}` : `#${idx + 1}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Loading skeleton ───────────────────────────────────────────────────
// We render a bare <Dialog> (not <EntityDetailModal>) because the latter
// requires a populated `sections` array. The skeleton mirrors the final
// surface's three zones (header / body / footer) at roughly the right
// heights to avoid layout shift when the data arrives.

function ClaimDetailSkeleton({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('employee.claimDetail');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
        <div className="shrink-0 border-b border-border px-6 pt-6 pb-4 pr-12">
          <DialogTitle className="sr-only">{t('loadingTitle')}</DialogTitle>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-4 w-64" />
          <div className="mt-2">
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Error state ────────────────────────────────────────────────────────
// Inline error inside a bare <Dialog> with an explicit "Retry" button so the
// caller can recover without closing the modal (which would discard the
// selected nrZgl).

function ClaimDetailError({
  open,
  onClose,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('employee.claimDetail');
  const tCommon = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0">
        <div className="px-6 py-6">
          <DialogTitle className="text-base font-bold text-text">
            {t('errorTitle')}
          </DialogTitle>
          <p className="mt-2 text-sm text-text-sub">{t('errorMessage')}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            {tCommon('close')}
          </Button>
          <Button type="button" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
