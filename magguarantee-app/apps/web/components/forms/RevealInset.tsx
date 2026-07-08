'use client';

// <RevealInset> — the single conditional-reveal affordance used by all three
// fleet form dialogs (docs/14-design-system.md §13.2.1).
//
// A left-accent bordered inset so a revealed sub-block reads as *belonging to*
// the checkbox / input above it, without wasteful `ml-6` indentation. Reveals
// with the existing `animate-slide-in` keyframe (no new keyframe, no new token).
//
// Presentational only — the parent still owns the `watch()` + mount/unmount and
// decides when to render this. Replaces the legacy `ml-6 mt-2 animate-slide-in`
// <FormItem> indentation and the ad-hoc `border-brand/40 bg-brand/5` equipment
// cells (TrailerSheet).

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function RevealInset({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'mt-2 space-y-3 animate-slide-in',
        'rounded-lg border border-border border-l-2 border-l-brand/50',
        'bg-input/40 p-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
