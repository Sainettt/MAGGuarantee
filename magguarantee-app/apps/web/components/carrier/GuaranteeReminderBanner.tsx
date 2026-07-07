'use client';

// Phase 12 — carrier Wnioski escalation strip (docs/14 §12.2).
//
// Since the full per-vehicle detail now has a home (the «Porozumienie» tab,
// §12.3), the Wnioski surface no longer carries the whole list. This is a
// one-line escalation STRIP: the claims page is for filing wnioski, so the
// watchdog only interrupts here when something is GENUINELY urgent, then points
// at the tab that owns the detail.
//
// Visibility (LOCKED): render ONLY when at least one owed vehicle is `violated`
// OR has `daysLeft ≤ 1`. At `daysLeft` 2–3 the strip stays silent (that lives on
// the tab + nav badge). Nothing owed / still loading → render NOTHING — silence
// is good; a phantom red bar that vanishes is worse than a late one.
//
// Tone = the worst qualifying vehicle: red (`danger`) if ANY is `violated`, else
// amber (`warning`). One ICU-plural sentence, no per-vehicle rows. CTA deep-links
// to `/carrier/porozumienie` (the tab that owns the detail), NOT the report form
// — the carrier reports the wyjazd from the tab's per-card CTA.

import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo } from 'react';

import { Button } from '@/components/ui/Button';
import { isOwed } from '@/lib/guarantee';
import { useMyGuaranteeCompliance } from '@/lib/hooks/useGuarantee';
import { cn } from '@/lib/utils';

export function GuaranteeReminderBanner() {
  const t = useTranslations('guarantee.strip');
  const { data } = useMyGuaranteeCompliance();

  // The escalation set: owed AND genuinely urgent (violated ∨ daysLeft ≤ 1).
  const urgent = useMemo(
    () =>
      (data?.items ?? []).filter(
        (v) => isOwed(v) && (v.state === 'violated' || (v.daysLeft ?? 99) <= 1),
      ),
    [data],
  );

  // Nothing urgent (or still loading) → render nothing. Silence is good.
  if (urgent.length === 0) return null;

  const anyViolated = urgent.some((v) => v.state === 'violated');
  const Icon = anyViolated ? AlertTriangle : Clock;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border-l-4 p-4 mb-6',
        anyViolated
          ? 'border-danger bg-danger-bg/40 dark:bg-danger/10'
          : 'border-warning bg-warning-bg/40 dark:bg-warning/10',
      )}
      role="region"
      aria-label={t('title', { count: urgent.length })}
    >
      <Icon
        size={16}
        className={anyViolated ? 'text-danger' : 'text-warning'}
        aria-hidden
      />
      <p
        className={cn(
          'flex-1 text-sm font-bold',
          anyViolated ? 'text-danger' : 'text-warning',
        )}
      >
        {t('title', { count: urgent.length })}
      </p>
      <Link href="/carrier/porozumienie" className="shrink-0">
        <Button size="sm" className="min-h-[44px]">
          {t('cta')}
          <ArrowRight size={14} aria-hidden />
        </Button>
      </Link>
    </div>
  );
}
