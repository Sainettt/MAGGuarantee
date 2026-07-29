// Phase 4.3 — `<KpiCard>` per docs/14-design-system.md L720.
//
// Anatomy:
//   - Wrapper: `<Card className="p-4 flex flex-col gap-1">`.
//   - Label: `text-xs font-medium uppercase tracking-wider text-text-sub`.
//   - Value: `text-3xl font-bold text-text`.
//   - Optional icon-slot top-right (absolute).
//
// Colour variants per the DS doc — `bg-card` chrome, an accent dot top-right
// to surface the status tone (blue/green/red/orange/purple). We keep the
// neutral surface (no full tinted backgrounds) so a five-tile row reads as
// a coordinated set rather than a rainbow.
//
// `loading` state shows a `<Skeleton>` over the value; `empty` (value == 0)
// keeps the layout stable — the brief asks for an empty-state placeholder
// at the page level rather than per-card.
//
// docs/14 §15 — a tile may also be a DRILL-DOWN affordance. Two interactive
// modes, mutually exclusive, both keeping the exact same anatomy:
//   - `href`     → renders as a `<Link>` (navigate to the pre-filtered list),
//   - `onClick`  → renders as a `<button aria-pressed={selected}>` (toggle an
//                  in-page filter, for panels that have no separate list route).
// Without either it stays the inert `<div>` it has always been.

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

export type KpiTone = 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'neutral';

const TONE_ACCENT: Record<KpiTone, string> = {
  blue: 'bg-info',
  green: 'bg-success',
  red: 'bg-danger',
  orange: 'bg-warning',
  // Brand red for "purple" — the DS palette does not include purple per
  // the policy "no new tokens"; we map the spec colour onto the closest
  // existing accent.
  purple: 'bg-brand',
  neutral: 'bg-text-sub',
};

const TONE_ICON: Record<KpiTone, string> = {
  blue: 'text-info',
  green: 'text-success',
  red: 'text-danger',
  orange: 'text-warning',
  purple: 'text-brand',
  neutral: 'text-text-sub',
};

/** Base chrome — identical for the inert and the interactive tile. */
const SHELL =
  'relative flex flex-col gap-1 p-4 rounded-xl border border-border bg-card shadow-card';

/**
 * Interactive affordance — the same recipe `<OpiekunCarrierCard>` uses for its
 * clickable card, so a clickable tile and a clickable card feel like one family.
 */
const INTERACTIVE =
  'w-full text-left cursor-pointer transition-[background-color,border-color,box-shadow] duration-150 ' +
  'hover:border-brand/40 hover:bg-brand-50/30 dark:hover:bg-brand/5 ' +
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:border-brand/60';

/** Toggled-on state for the `onClick` (in-page filter) mode. */
const SELECTED = 'border-brand/60 bg-brand-50/40 dark:bg-brand/10';

export interface KpiCardProps {
  label: string;
  /** Pre-formatted value. Pass `'—'` for an explicitly-empty tile. */
  value: string | number;
  tone?: KpiTone;
  icon?: LucideIcon;
  loading?: boolean;
  /** Drill-down target — renders the tile as a `<Link>`. */
  href?: string;
  /**
   * In-page filter toggle — renders the tile as a `<button>`. Ignored when
   * `href` is set (a tile is either a link or a toggle, never both).
   */
  onClick?: () => void;
  /** `onClick` mode only — marks the tile as the currently applied filter. */
  selected?: boolean;
  /**
   * Accessible name for the interactive tile. Without it the tile is announced
   * as "label value", which reads fine but doesn't say what activating it does.
   */
  ariaLabel?: string;
}

export function KpiCard({
  label,
  value,
  tone = 'neutral',
  icon: Icon,
  loading,
  href,
  onClick,
  selected,
  ariaLabel,
}: KpiCardProps) {
  const body = (
    <>
      <span className="text-xs font-bold uppercase tracking-normal text-text-sub line-clamp-2 min-h-[2rem] leading-4 pr-8">
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <span className="text-3xl font-bold text-text tabular-nums">
          {value}
        </span>
      )}
      {/* Top-right accent dot — small, decorative, signals the status tone
          without colouring the entire card. */}
      <span
        aria-hidden
        className={cn(
          'absolute right-4 top-4 inline-block h-2 w-2 rounded-full',
          TONE_ACCENT[tone],
        )}
      />
      {Icon && (
        <Icon
          aria-hidden
          size={18}
          className={cn(
            'absolute right-10 top-4',
            TONE_ICON[tone],
          )}
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={cn(SHELL, INTERACTIVE)}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={ariaLabel}
        className={cn(SHELL, INTERACTIVE, selected && SELECTED)}
      >
        {body}
      </button>
    );
  }

  return <div className={SHELL}>{body}</div>;
}
