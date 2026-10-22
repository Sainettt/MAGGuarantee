'use client';

// Phase 7.6 — verification-SLA «attention» bucket (docs/14 §7.6).
//
// One severity-styled group: `overdue` (danger / red) above `dueSoon`
// (warning / amber). Composes the established sidebar card shell + a §7.6.1
// group header (icon + uppercase title + count pill) + clickable claim rows.
//
// Severity is a prop that selects the danger/warning token family for the
// header, the count pill, the per-row left-border + tinted surface, and the
// optional card accent. No new tokens — `danger`/`warning` semantics + their
// `-bg` surfaces already exist (Phase 4.4 token policy).
//
// Each row links to the claim filter (`/employee/claims?nrZgl=…`), matching
// the old `urgent` row's deep-link, and carries a worded countdown badge so
// urgency is never colour-alone (a11y).
//
// docs/21 — the buckets also carry open reklamacje (`REKLAMACJA`). Those rows
// get the regular claim <StatusBadge> stacked under the countdown (no new
// styling; the column is never wider than the countdown chip, so the row
// holds at phone width) and the aria-label names the reklamacja, because the
// label replaces the chip text for screen readers.

import { AlertTriangle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { DashboardSlaClaim } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { slaRowView } from '@/lib/dashboard/slaRow';
import { cn } from '@/lib/utils';

import { SlaCountdownBadge } from './SlaCountdownBadge';

type Severity = 'overdue' | 'dueSoon';

interface SlaAttentionSectionProps {
  severity: Severity;
  claims: DashboardSlaClaim[];
}

const SEVERITY = {
  overdue: {
    icon: AlertTriangle,
    titleKey: 'overdueTitle',
    card: 'border-danger/30',
    headerText: 'text-danger',
    pill: 'border-danger/40 text-danger',
    row: cn(
      'border-l-2 border-danger bg-danger-bg/40 dark:bg-danger/10',
      'hover:bg-danger-bg/70 dark:hover:bg-danger/15',
      'focus-visible:ring-danger',
    ),
  },
  dueSoon: {
    icon: Clock,
    titleKey: 'dueSoonTitle',
    card: 'border-warning/30',
    headerText: 'text-warning',
    pill: 'border-warning/40 text-warning',
    row: cn(
      'border-l-2 border-warning bg-warning-bg/40 dark:bg-warning/10',
      'hover:bg-warning-bg/70 dark:hover:bg-warning/15',
      'focus-visible:ring-warning',
    ),
  },
} as const;

export function SlaAttentionSection({
  severity,
  claims,
}: SlaAttentionSectionProps) {
  const t = useTranslations('dashboard.sla');
  const s = SEVERITY[severity];
  const Icon = s.icon;

  return (
    <section
      className={cn('rounded-xl border bg-card shadow-card', s.card)}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon size={14} className={s.headerText} aria-hidden />
        <h2
          className={cn(
            'flex-1 text-sm font-bold uppercase tracking-wider',
            s.headerText,
          )}
        >
          {t(s.titleKey)}
        </h2>
        <Badge
          variant="muted"
          className={cn('border bg-transparent', s.pill)}
        >
          {claims.length}
        </Badge>
      </header>
      <div className="p-3">
        <ul className="space-y-1">
          {claims.map((c) => {
            const { kind, countdown } = slaRowView(c);
            return (
              <li key={c.id}>
                <Link
                  href={`/employee/claims?nrZgl=${encodeURIComponent(c.nrZgl)}`}
                  aria-label={t('rowAria', {
                    nrZgl: c.nrZgl,
                    kind,
                    status:
                      countdown.key === 'lastDay'
                        ? t('countdown.lastDay')
                        : t(`countdown.${countdown.key}`, {
                            days: countdown.days,
                          }),
                  })}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5',
                    'cursor-pointer transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                    s.row,
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      <span className="font-medium tabular-nums text-text">
                        {c.nrZgl}
                      </span>{' '}
                      <span className="text-xs text-text-sub">
                        {c.carrierName ?? '—'}
                      </span>
                    </span>
                    {c.vehiclePlate ? (
                      <span className="block truncate text-xs text-text-sub tabular-nums">
                        {c.vehiclePlate}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <SlaCountdownBadge workingDaysLeft={c.workingDaysLeft} />
                    {kind === 'reklamacja' ? (
                      <StatusBadge status="REKLAMACJA" />
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
