'use client';

// Phase 12 — carrier Porozumienie per-vehicle status ROW (docs/14 §12.3.2,
// REWORKED 2026-07-07 — replaces the rejected <GuaranteeStatusCard> grid).
//
// A full-width row (not a card): identity + truncating meta line on the left,
// a `shrink-0` right cluster (§12.1 countdown badge + «Zgłoś wyjazd» CTA) on the
// right. The STATE is NOT named here — it lives in the group-section header
// (§12.3.2), so there is no per-row state chip (the retired <GuaranteeStateChip>)
// and no long PL state string competing for the row's width budget. This is the
// structural fix for the v1 overflow.
//
// Carrier-only surface: the internal MAGTRANS `sideNumber` is NEVER rendered
// here (no slot, nothing to gate) — see the §12.3.2 sideNumber-gating rule.
//
// The `ok_active` (W trasie) variant diverges: no deadline, no countdown (the
// counter is paused), plain `bg-card`, and the CTA recedes to an outline — the
// carrier may still report the next wyjazd early, but nothing is owed.

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { GuaranteeComplianceItem } from '@magguarantee/shared';

import { GuaranteeCountdownBadge } from '@/components/carrier/GuaranteeCountdownBadge';
import { Button } from '@/components/ui/Button';
import { formatDateFull } from '@/lib/format/numbers';
import { type GuaranteeCardGroup, guaranteeCardGroup } from '@/lib/guarantee';
import { cn } from '@/lib/utils';

// Worst-wins left-border + row tint (§12.3.2). Owed groups get a soft tint;
// `watched` (calm) and `okActive` stay plain `bg-card` — quiet by design (the
// calm group's only accent is its muted countdown pill; the fix for the
// rejected gray chip).
const ROW_TONE: Record<GuaranteeCardGroup, string> = {
  violated: 'border-l-danger bg-danger-bg/30 dark:bg-danger/10',
  dueSoon: 'border-l-warning bg-warning-bg/30 dark:bg-warning/10',
  watched: 'border-l-border bg-card',
  okActive: 'border-l-success bg-card',
};

interface GuaranteeStatusRowProps {
  item: GuaranteeComplianceItem;
  /** Pre-computed group (the page already partitioned; avoids re-deriving). */
  group?: GuaranteeCardGroup;
}

export function GuaranteeStatusRow({ item, group }: GuaranteeStatusRowProps) {
  const t = useTranslations('guarantee.porozumienie');
  const variant = group ?? guaranteeCardGroup(item);
  // `inactive` (null) never reaches a row — the page filters it out — but keep
  // the guard so the component is total.
  if (variant == null) return null;

  const isOkActive = variant === 'okActive';

  // ── Meta line — anchor + deadline joined by « · », one truncating line.
  //    ok_active shows just «w trasie» (counter paused, no deadline). ────────
  let metaLine: string;
  if (isOkActive) {
    metaLine = t('onRoad');
  } else {
    const anchorKey =
      item.anchorSource === 'agreement' ? 'anchor.agreement' : 'anchor.zjechal';
    const parts: string[] = [];
    if (item.anchorAt) {
      parts.push(t(anchorKey, { date: formatDateFull(item.anchorAt) }));
    }
    if (item.deadlineAt) {
      parts.push(t('deadline', { date: formatDateFull(item.deadlineAt) }));
    }
    metaLine = parts.join(' · ');
  }

  return (
    <li
      className={cn(
        'flex flex-col gap-3 border-l-4 px-4 py-3 sm:flex-row sm:items-center',
        ROW_TONE[variant],
      )}
    >
      {/* Identity + meta — grows, truncates; NO sideNumber (carrier-only). */}
      <div className="min-w-0 flex-1">
        <span className="font-mono font-semibold text-text">
          {item.plateNumber}
        </span>
        {metaLine ? (
          <p className="mt-0.5 truncate text-xs text-text-sub tabular-nums">
            {metaLine}
          </p>
        ) : null}
      </div>

      {/* Right cluster — never shrinks, never overflows. */}
      <div className="flex shrink-0 items-center gap-2 max-sm:justify-end">
        {!isOkActive ? (
          <GuaranteeCountdownBadge daysLeft={item.daysLeft ?? 0} />
        ) : null}
        <Link href={`/carrier/delegations/new?vehicleId=${item.vehicleId}`}>
          <Button
            size="sm"
            variant={isOkActive ? 'outline' : 'default'}
            className="min-h-[44px] whitespace-nowrap"
          >
            {t('reportCta')}
            <ArrowRight size={14} aria-hidden />
          </Button>
        </Link>
      </div>
    </li>
  );
}
