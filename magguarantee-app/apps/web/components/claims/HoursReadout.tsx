'use client';

// Phase 3.1 — shared hours readout used on the carrier claim detail header
// (read-only) and twice inside the employee verification modal (read-only
// context block + live-recompute under the `hoursAdjusted` input).
//
// Design source: docs/14-design-system.md §"Phase 3.1 — claim detail polish",
// section A "Hours readout pattern (HoursReadout)".
//
// Renders one of three states:
//
//   1. `Czas: 240,00 h` — when `rawTotalDays === totalDays` (no exclusion
//      correction and no verifier override): collapse to a single value to
//      avoid visual noise on simple one-month claims.
//   2. `Czas: 240,00 h surowych / 215,50 h zaliczonych` — when the two
//      values diverge: emphasise the counted (post-correction) number, mute
//      the raw baseline. Optional hint underneath:
//        - "Po wyłączeniach i korektach" by default.
//        - "Po ręcznej korekcie weryfikatora" when `live` (verifier modal,
//          live recompute under the hoursAdjusted input).
//   3. `Czas: —` — when `rawTotalDays` is missing (legacy claim, no engine
//      output yet). Never crash, never render `NaN h`.
//
// `live` is intentionally a thin visual marker — it only swaps the hint to
// the override copy. The actual recomputation of `totalDays` is done by the
// caller (verifier modal does it locally from the watched `hoursAdjusted`
// input — see `ClaimVerificationModal.tsx`); this component renders only.

import { useTranslations } from 'next-intl';

import { formatHoursPl } from '@magguarantee/shared';

import { cn } from '@/lib/utils';

export interface HoursReadoutProps {
  /**
   * Pre-adjustment total days (engine `rawTotalDays`). When `undefined` /
   * `null` the component renders the missing-breakdown fallback.
   */
  rawTotalDays?: number | null;
  /**
   * Post-adjustment total days (engine `totalDays`). Should be present
   * whenever `rawTotalDays` is — caller is expected to read both from the
   * same breakdown payload (or compute locally for the live modal case).
   */
  totalDays?: number | null;
  /**
   * Marks the readout as live-updating from a verifier input. Swaps the
   * hint copy to "Po ręcznej korekcie weryfikatora" and adds a subtle
   * pulse indicator so the verifier sees which line tracks their input.
   * Default `false` (read-only display on the carrier detail page).
   */
  live?: boolean;
  className?: string;
}

export function HoursReadout({
  rawTotalDays,
  totalDays,
  live = false,
  className,
}: HoursReadoutProps) {
  const t = useTranslations('hoursReadout');

  // Fallback path — no engine output. Render `Czas: —` only, no hint, no
  // second value. Documented in design system § A "Missing breakdown".
  if (rawTotalDays == null || !Number.isFinite(rawTotalDays)) {
    return (
      <p
        className={cn(
          'text-sm text-text inline-flex items-baseline gap-1.5 flex-wrap',
          className,
        )}
      >
        <span className="text-text-sub font-medium">{t('label')}:</span>
        <span className="text-text-sub">{t('missing')}</span>
      </p>
    );
  }

  // Treat `totalDays === null/undefined` the same as identical raw — the
  // safest default rather than rendering `NaN h zaliczonych`.
  const counted =
    totalDays != null && Number.isFinite(totalDays) ? totalDays : rawTotalDays;

  // Round both before comparison so a 8.870001 vs 8.87 round-trip from the
  // legacy JSONB store doesn't accidentally render two identical-looking
  // numbers as the "diverged" two-value state.
  const rawRounded = Math.round(rawTotalDays * 100) / 100;
  const countedRounded = Math.round(counted * 100) / 100;
  const identical = rawRounded === countedRounded;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <p
        className={cn(
          'text-sm text-text inline-flex items-baseline gap-1.5 flex-wrap',
          live && 'transition-colors',
        )}
      >
        <span className="text-text-sub font-medium">{t('label')}:</span>
        {identical ? (
          <span className="tabular-nums font-semibold text-text">
            {formatHoursPl(rawTotalDays)}
          </span>
        ) : (
          <>
            <span className="tabular-nums text-text-sub">
              {formatHoursPl(rawTotalDays)} {t('raw')}
            </span>
            <span className="text-text-sub mx-0.5" aria-hidden>
              /
            </span>
            <span
              className={cn(
                'tabular-nums font-semibold text-text',
                live && 'text-brand',
              )}
            >
              {formatHoursPl(counted)} {t('counted')}
            </span>
          </>
        )}
      </p>
      {!identical && (
        <p className="text-xs text-text-sub">
          {live ? t('hint.override') : t('hint.adjusted')}
        </p>
      )}
    </div>
  );
}
