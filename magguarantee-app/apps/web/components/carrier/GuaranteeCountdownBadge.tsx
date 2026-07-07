'use client';

// Phase 12 — Guarantee-watchdog countdown chip (docs/14 §12.1).
//
// A sibling of §7.6.1's `<SlaCountdownBadge>` — same chip geometry, same class
// recipe, same ICU-plural discipline. It counts *working days left to report a
// wyjazd* off the signed `daysLeft` the API returns:
//   < 0 → «po terminie» / «N dni po terminie»  (danger / red)
//   = 0 → «dziś ostatni dzień»                  (warning / amber)
//   1–3 → «N dni robocze»                       (warning / amber, ICU plural)
//   ≥ 4 → «N dni robocze»                       (muted / neutral — comfortable)
//
// The `≥ 4` muted variant uses the soft-chrome surface (`bg-input`) so a
// comfortable countdown never looks alarming (§12.1); it only appears on the
// fleet-row badge and the board's neutral rows, never in the banner. Urgency is
// never colour-alone — every chip carries a worded «dni robocze» countdown.

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface GuaranteeCountdownBadgeProps {
  daysLeft: number;
}

// Identical base recipe to `<SlaCountdownBadge>` (§7.6.1 / §12.1).
const BASE =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap tabular-nums';

export function GuaranteeCountdownBadge({
  daysLeft,
}: GuaranteeCountdownBadgeProps) {
  const t = useTranslations('guarantee.countdown');

  // Derive label + tone family from the signed `daysLeft`, mirroring the
  // §12.1 table. Overdue surfaces the magnitude as a positive count so the ICU
  // «dni» plural reads correctly.
  let label: string;
  let tone: string;
  if (daysLeft < 0) {
    label = t('overdue', { days: Math.abs(daysLeft) });
    tone = 'bg-danger/15 text-danger border-danger/30';
  } else if (daysLeft === 0) {
    label = t('today');
    tone = 'bg-warning/15 text-warning border-warning/30';
  } else if (daysLeft <= 3) {
    label = t('dueSoon', { days: daysLeft });
    tone = 'bg-warning/15 text-warning border-warning/30';
  } else {
    label = t('remaining', { days: daysLeft });
    tone = 'bg-input text-text-sub border-border';
  }

  return <span className={cn(BASE, tone)}>{label}</span>;
}
