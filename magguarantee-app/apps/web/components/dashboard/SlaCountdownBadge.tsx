'use client';

// Phase 7.6 — verification-SLA countdown chip (docs/14 §7.6.1).
//
// Renders the working-days-left label off the signed `workingDaysLeft`:
//   < 0 → «po terminie»            (danger / red)
//   = 0 → «dziś ostatni dzień»     (warning / amber)
//   1–3 → «{n} dni robocze»        (warning / amber, ICU plural)
//
// The `overdue` / `dueSoon` split is already decided upstream (mutually
// exclusive buckets, overdue wins). We derive the family from the sign so the
// chip is self-consistent even if rendered standalone, but the section that
// hosts it always matches.

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface SlaCountdownBadgeProps {
  workingDaysLeft: number;
}

const BASE =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap tabular-nums';

export function SlaCountdownBadge({ workingDaysLeft }: SlaCountdownBadgeProps) {
  const t = useTranslations('dashboard.sla.countdown');

  const isOverdue = workingDaysLeft < 0;

  // Overdue → fixed «po terminie» (we surface the magnitude as a positive count
  // so the ICU «dni» plural reads correctly). dueSoon → 0 special-cased to
  // «dziś ostatni dzień», else «{n} dni robocze».
  const label = isOverdue
    ? t('overdue', { days: Math.abs(workingDaysLeft) })
    : workingDaysLeft === 0
      ? t('lastDay')
      : t('dueSoon', { days: workingDaysLeft });

  return (
    <span
      className={cn(
        BASE,
        isOverdue
          ? 'bg-danger/15 text-danger border-danger/30'
          : 'bg-warning/15 text-warning border-warning/30',
      )}
    >
      {label}
    </span>
  );
}
