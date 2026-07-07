'use client';

// Phase 12 — Guarantee-watchdog state chip (docs/14 §12.3.2).
//
// A thin wrapper over the §7.10.1 <StatusBadge> anatomy that NAMES the watchdog
// state in words (the countdown badge names the *number*; together they are
// colour-independent — a11y, same discipline as every other watchdog surface).
// It composes the existing severity tones (danger / warning / muted / success)
// with their soft `/15` + `bg-input` surfaces — ZERO new tokens.
//
// The four card groups (§12.3.2) map 1:1 onto the four variants: `violated`
// «Po terminie» · `dueSoon` «Zbliża się termin» · `watched` «Pod obserwacją» ·
// `okActive` «W trasie / wyjazd zgłoszony». Icons are the optional §7.10.1 12px
// Lucide set (they never carry meaning alone — the label always does).

import {
  AlertTriangle,
  Clock,
  Eye,
  type LucideIcon,
  Truck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/** The four Porozumienie card groups (§12.3.2), matching the i18n chip keys. */
export type GuaranteeChipVariant = 'violated' | 'dueSoon' | 'watched' | 'okActive';

// §7.10.1 chip geometry. Tones reuse the existing severity families + soft
// chrome (`bg-input`) — the same recipe the countdown badge uses (§12.1).
const BASE =
  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap';

const VARIANT: Record<GuaranteeChipVariant, { tone: string; icon: LucideIcon }> = {
  violated: { tone: 'bg-danger/15 text-danger border-danger/30', icon: AlertTriangle },
  dueSoon: { tone: 'bg-warning/15 text-warning border-warning/30', icon: Clock },
  watched: { tone: 'bg-input text-text-sub border-border', icon: Eye },
  okActive: { tone: 'bg-success/15 text-success border-success/30', icon: Truck },
};

interface GuaranteeStateChipProps {
  variant: GuaranteeChipVariant;
  className?: string;
}

export function GuaranteeStateChip({ variant, className }: GuaranteeStateChipProps) {
  const t = useTranslations('guarantee.porozumienie.chip');
  const { tone, icon: Icon } = VARIANT[variant];

  return (
    <span className={cn(BASE, tone, className)}>
      <Icon size={12} aria-hidden />
      {t(variant)}
    </span>
  );
}
