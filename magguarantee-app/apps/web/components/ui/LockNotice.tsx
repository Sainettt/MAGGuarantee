// <LockNotice> — docs/14-design-system.md §6.5.13 (block-level lock, Tier B).
//
// A quiet informational line explaining WHY a whole block is non-editable.
// Posture: a lock caused by a normal workflow state is NOT an error — no
// <Alert>, no semantic colour, no dismiss affordance, no coloured icon.
//
// Reusable project-wide: any form section that becomes read-only for a state
// or role reason gets exactly ONE of these above it, never N greyed inputs
// with N lock glyphs.
//
// The component owns no i18n — copy is passed in as children.

import { Lock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface LockNoticeProps {
  children: ReactNode;
  /** Wire the locked block to this notice via `aria-describedby`. */
  id?: string;
  className?: string;
  /**
   * Leading glyph. Defaults to `<Lock>`; §16.1 / §16.5.3 reuse this exact
   * surface for notices that explain a CONFIGURATION rather than a lock
   * (fallback limits, a month without a guarantee) and pass `<Info>` instead.
   * The posture is unchanged: neutral, no semantic colour, no dismiss.
   */
  icon?: LucideIcon;
}

export function LockNotice({
  children,
  id,
  className,
  icon: Icon = Lock,
}: LockNoticeProps) {
  return (
    <p
      role="note"
      id={id}
      className={cn(
        'flex items-start gap-2 rounded-md border border-border bg-input px-3 py-2 text-xs text-text-sub',
        className,
      )}
    >
      <Icon size={14} aria-hidden className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export default LockNotice;
