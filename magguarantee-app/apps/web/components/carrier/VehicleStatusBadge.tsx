'use client';

// Vehicle-status rework, Step 5 — <VehicleStatusBadge>. Sibling of the
// claim/delegation <StatusBadge>, mapping the DELEGATION-driven vehicle
// lifecycle status (five values) to a <Badge> composition per
// docs/14-design-system.md §6.3.6.
//
// Meaning never rides on hue alone: every state carries an icon + text label,
// and a day-range `title` / `aria-label` tooltip (`role="img"` accessible name)
// so colour-blind + screen-reader users get the full window. The two grey
// states — `stojaca` (neutral, calmly parked) and `wylaczona` (muted, manually
// switched off) — are separated on three non-hue channels: fill (solid vs
// transparent), border (solid vs dashed) and icon (CircleParking vs PowerOff).
//
// ZERO new palette tokens (§6.3.6): each treatment composes existing semantic
// tokens (or an existing token at reduced opacity), matching the claim
// status-map recipe (`bg-*/15 text-* border-*/30`). Reuses the shared <Badge>
// primitive; `cn`/twMerge resolves the base `font-bold` → the §6.3.6
// `font-medium` and swaps the muted fill for the per-status tone.

import {
  CircleParking,
  PauseCircle,
  PowerOff,
  Trash2,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleLifecycleStatus } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface StatusMeta {
  icon: LucideIcon;
  /** §6.3.6 tone classes (semantic tokens only, some at reduced opacity). */
  className: string;
  /** Whether an idle clock runs (so `daysSinceReturn` can enrich the tooltip). */
  hasClock: boolean;
}

const META: Record<VehicleLifecycleStatus, StatusMeta> = {
  aktywna: {
    icon: Truck,
    className: 'bg-success/15 text-success border-success/30',
    hasClock: false,
  },
  stojaca: {
    // Neutral / calm — a SOLID soft chip with a solid border (§6.3.6). Never
    // amber (that meaning migrated to «Długo stojąca» / `nieaktywna`).
    icon: CircleParking,
    className: 'bg-input text-text-sub border-border',
    hasClock: true,
  },
  nieaktywna: {
    icon: PauseCircle,
    className: 'bg-warning/15 text-warning border-warning/30',
    hasClock: true,
  },
  do_usuniecia: {
    icon: Trash2,
    className: 'bg-danger/15 text-danger border-danger/30',
    hasClock: true,
  },
  wylaczona: {
    // Muted / off — a TRANSPARENT hollow chip with a DASHED border (§6.3.6),
    // reading unmistakably as manual deactivation, distinct from the solid
    // "parked-and-resting" `stojaca` chip.
    icon: PowerOff,
    className: 'bg-transparent text-text-sub border-dashed border-border',
    hasClock: false,
  },
};

export interface VehicleStatusBadgeProps {
  status: VehicleLifecycleStatus;
  /**
   * Calendar days since the idle anchor. When present on a clock-running state
   * it is appended to the tooltip so the exact count is spelled out; ignored
   * (and always `null`) for `aktywna` / `wylaczona`.
   */
  daysSinceReturn?: number | null;
  className?: string;
}

export function VehicleStatusBadge({
  status,
  daysSinceReturn,
  className,
}: VehicleStatusBadgeProps) {
  const t = useTranslations('vehicleStatus');
  const meta = META[status];
  const Icon = meta.icon;

  const label = t(`${status}.badge`);
  let tooltip = t(`${status}.tooltip`);
  if (meta.hasClock && typeof daysSinceReturn === 'number') {
    tooltip = `${tooltip} · ${t('daysCount', { days: daysSinceReturn })}`;
  }

  return (
    <Badge
      variant="muted"
      role="img"
      aria-label={tooltip}
      title={tooltip}
      className={cn(
        'gap-1.5 border font-medium whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      <Icon size={12} aria-hidden />
      {label}
    </Badge>
  );
}
