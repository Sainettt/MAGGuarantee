'use client';

// Phase 4 — `<RecalcBadge>` shown at the top of the verification modal's
// Edit tab. Reflects the state of the debounced `/claims/:nrZgl/preview`
// call so the verifier sees how their amendments to mileage / dates /
// hoursAdjusted change the doplata before they commit.
//
// Per `docs/14-design-system.md` Phase 4 § "ClaimVerificationModal":
//   - while debounce pending or fetch in-flight → `animate-pulse`, "Przeliczam…"
//   - on success → muted state, optionally a delta string
//   - on error → soft warning state, doesn't block submit

import { AlertCircle, Loader2, RefreshCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { formatEur } from '@/lib/format/numbers';
import { cn } from '@/lib/utils';

export interface RecalcBadgeProps {
  state: 'idle' | 'loading' | 'success' | 'error';
  /** Current persisted doplata (server side) — anchor for the diff. */
  baseAmount: number;
  /** Latest previewed doplata — what the form would settle on if saved now. */
  previewAmount?: number;
  className?: string;
}

export function RecalcBadge({
  state,
  baseAmount,
  previewAmount,
  className,
}: RecalcBadgeProps) {
  const t = useTranslations('employee.claims.modal.recalc');

  if (state === 'loading') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1 text-xs font-medium text-text-sub',
          'animate-pulse',
          className,
        )}
        aria-live="polite"
      >
        <Loader2 size={12} className="animate-spin" aria-hidden />
        {t('loading')}
      </span>
    );
  }

  if (state === 'error') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning-dark dark:text-warning',
          className,
        )}
        aria-live="polite"
      >
        <AlertCircle size={12} aria-hidden />
        {t('error')}
      </span>
    );
  }

  // success / idle
  const showDiff =
    typeof previewAmount === 'number' &&
    Math.abs(previewAmount - baseAmount) >= 0.005;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1 text-xs font-medium text-text-sub',
        className,
      )}
      aria-live="polite"
    >
      <RefreshCcw size={12} aria-hidden />
      {showDiff
        ? t('diff', {
            before: formatEur(baseAmount),
            after: formatEur(previewAmount as number),
          })
        : t('current')}
    </span>
  );
}
