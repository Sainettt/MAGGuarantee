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

import type { LucideIcon } from 'lucide-react';

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

export interface KpiCardProps {
  label: string;
  /** Pre-formatted value. Pass `'—'` for an explicitly-empty tile. */
  value: string | number;
  tone?: KpiTone;
  icon?: LucideIcon;
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  tone = 'neutral',
  icon: Icon,
  loading,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-1 p-4 rounded-xl border border-border bg-card shadow-card',
      )}
    >
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
    </div>
  );
}
