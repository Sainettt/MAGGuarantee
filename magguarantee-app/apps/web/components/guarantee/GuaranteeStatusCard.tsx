'use client';

// Phase 12 — carrier Porozumienie per-vehicle status card (docs/14 §12.3.2).
//
// One card per guaranteed vehicle. Composes the §12.2 tinted-card recipe
// (`border-l-4` + severity tint) with the shipped <GuaranteeCountdownBadge> and
// the new <GuaranteeStateChip> — the chip names the STATE, the badge names the
// NUMBER, so urgency never rides on colour alone (a11y). No new tokens.
//
// The `ok_active` (W trasie) variant diverges from the owed cards: no deadline,
// no countdown (the counter is paused), and the «Zgłoś wyjazd» CTA recedes to an
// outline so nothing on it screams for action — the carrier may still report the
// next wyjazd early, but nothing is owed.

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { GuaranteeComplianceItem } from '@magguarantee/shared';

import { GuaranteeCountdownBadge } from '@/components/carrier/GuaranteeCountdownBadge';
import { Button } from '@/components/ui/Button';
import { formatDateFull } from '@/lib/format/numbers';
import { type GuaranteeCardGroup, guaranteeCardGroup } from '@/lib/guarantee';
import { cn } from '@/lib/utils';

import { GuaranteeStateChip } from './GuaranteeStateChip';

// Worst-wins left-border tints, same family as the strip (§12.2). `watched`
// (calm) uses the neutral border so a comfortable countdown never looks alarming.
const BORDER: Record<GuaranteeCardGroup, string> = {
  violated: 'border-l-danger',
  dueSoon: 'border-l-warning',
  watched: 'border-l-border',
  okActive: 'border-l-success',
};

interface GuaranteeStatusCardProps {
  item: GuaranteeComplianceItem;
  /** Pre-computed group (the page already partitioned; avoids re-deriving). */
  group?: GuaranteeCardGroup;
}

export function GuaranteeStatusCard({ item, group }: GuaranteeStatusCardProps) {
  const t = useTranslations('guarantee.porozumienie');
  const variant = group ?? guaranteeCardGroup(item);
  // `inactive` (null) never reaches a card — the page filters it out — but keep
  // the guard so the component is total.
  if (variant == null) return null;

  const isOkActive = variant === 'okActive';

  const anchorLine =
    item.anchorAt != null
      ? item.anchorSource === 'agreement'
        ? t('anchor.agreement', { date: formatDateFull(item.anchorAt) })
        : t('anchor.zjechal', { date: formatDateFull(item.anchorAt) })
      : null;

  return (
    <article
      className={cn(
        'rounded-xl border bg-card shadow-card border-l-4 p-4',
        BORDER[variant],
      )}
    >
      {/* Header — identity + state chip. */}
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold text-text">
          {item.plateNumber}
        </span>
        <span className="text-xs text-text-sub">· {item.sideNumber ?? '—'}</span>
        <span className="ml-auto">
          <GuaranteeStateChip variant={variant} />
        </span>
      </div>

      {/* Body — anchor + deadline (deadline omitted for ok_active). */}
      {(anchorLine || (!isOkActive && item.deadlineAt)) && (
        <dl className="mt-2 space-y-0.5 text-xs text-text-sub tabular-nums">
          {anchorLine ? <div>{anchorLine}</div> : null}
          {!isOkActive && item.deadlineAt ? (
            <div>{t('deadline', { date: formatDateFull(item.deadlineAt) })}</div>
          ) : null}
        </dl>
      )}

      {/* Footer — countdown (not on ok_active) + per-card CTA. */}
      <div className="mt-3 flex items-center gap-2">
        {!isOkActive ? (
          <GuaranteeCountdownBadge daysLeft={item.daysLeft ?? 0} />
        ) : null}
        <Link
          href={`/carrier/delegations/new?vehicleId=${item.vehicleId}`}
          className="ml-auto shrink-0"
        >
          <Button
            size="sm"
            variant={isOkActive ? 'outline' : 'default'}
            className="min-h-[44px]"
          >
            {t('reportCta')}
            <ArrowRight size={14} aria-hidden />
          </Button>
        </Link>
      </div>
    </article>
  );
}
