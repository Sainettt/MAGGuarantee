'use client';

// Severity/countdown chip for a document-expiry alert (docs/14 §12.5 badge
// vocabulary — expired/critical → danger, warning → amber, upcoming → info).
//
// The label is derived from the signed `daysToExpiry`:
//   < 0 → «Przeterminowany o {n} dni»   (danger)
//   = 0 → «Wygasa dziś»                 (danger)
//   1–3 → «Za {n} dni»                  (amber)
//   4–7 → «Za {n} dni»                  (info)

import { useTranslations } from 'next-intl';

import type { AlertSeverity } from '@magguarantee/shared';

import { cn } from '@/lib/utils';

interface AlertCountdownBadgeProps {
  severity: AlertSeverity;
  daysToExpiry: number;
}

const TONE: Record<AlertSeverity, string> = {
  expired: 'bg-danger/15 text-danger border-danger/30',
  critical: 'bg-danger/15 text-danger border-danger/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  upcoming: 'bg-info/15 text-info border-info/30',
};

const BASE =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap tabular-nums';

export function AlertCountdownBadge({
  severity,
  daysToExpiry,
}: AlertCountdownBadgeProps) {
  const t = useTranslations('alerts.countdown');

  const label =
    daysToExpiry < 0
      ? t('expired', { days: Math.abs(daysToExpiry) })
      : daysToExpiry === 0
        ? t('today')
        : t('upcoming', { days: daysToExpiry });

  return <span className={cn(BASE, TONE[severity])}>{label}</span>;
}
