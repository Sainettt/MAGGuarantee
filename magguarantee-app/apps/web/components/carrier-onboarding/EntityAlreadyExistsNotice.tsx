'use client';

// Phase 3.2 (post-onboardingStatus-drop) — info banner shown inside the
// Vehicle / Trailer / Driver wizard sheet when the carrier ALREADY has at
// least one row of that entity type. Mirrors the visual pattern of
// `TemporaryPasswordRow` (see Phase 3.4 §C) but at info-blue intensity, and is dismissible
// within the current step (re-appears on the next resume because the
// "exists" snapshot lives in the wizard state, not in the dismissed UI).
//
// Implementation note: kept non-sticky (a one-line div at the top of
// <SheetBody>) — the info is "by the way" context, not action-required like
// the temp password banner, so the form fields shouldn't compete with it for
// vertical real estate as the operator scrolls.

import { Info, X } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  /** Translated body text — caller chooses vehicle/trailer/driver wording. */
  message: string;
  /** aria-label for the dismiss button — translated by the caller. */
  dismissLabel: string;
}

export function EntityAlreadyExistsNotice({ message, dismissLabel }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      role="note"
      className={cn(
        // Soft info surface; the icon + word do the disambiguation. Sits at
        // the very top of <SheetBody> above the form sections.
        'mb-4 flex items-start gap-2 rounded-sm border border-info/40 bg-info-bg px-3 py-2 text-sm text-text',
      )}
    >
      <Info size={16} className="mt-0.5 shrink-0 text-info-dark" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={dismissLabel}
        className={cn(
          'shrink-0 rounded-sm p-0.5 text-info-dark hover:bg-info/10',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        )}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
