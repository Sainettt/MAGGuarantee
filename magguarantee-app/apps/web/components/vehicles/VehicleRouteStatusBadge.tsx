'use client';

// Phase 7.5 — route-status badge for the weryfikator vehicle board
// (docs/14-design-system.md §7.5.1).
//
// Three-state tone-map (existing tokens only — no new <Badge> variant):
//   • w_trasie → success (green)  — vehicle actively working, the positive signal
//   • zjechal  → muted   (grey fill) — done/parked, neutral-settled
//   • nieznany → outline (fill-less, border-border, text-text-sub) — the DERIVED
//     "not checked today" value. Deliberately the MOST recessive: it is the
//     normal fresh-day state, NEVER an error → never warning/danger (no orange/red).
//
// The local <Badge variant> only goes up to success/muted, so the `nieznany`
// "outline" look is composed directly here from tokens (transparent fill +
// border + sub text), mirroring the §7.5.1 anatomy. Status is carried by text
// + colour (a11y) — the Lucide icon is decorative.
//
// The vehicle tone-map is kept local to web, consistent with the existing
// DelegationStatus tone-map in `components/carrier/StatusBadge.tsx` (which is
// also local, not in @magguarantee/shared).

import {
  HelpCircle,
  type LucideIcon,
  ParkingSquare,
  Truck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleBoardStatus } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'muted';

interface RouteStatusMeta {
  /** When set, render via the shared <Badge variant>. */
  variant?: BadgeVariant;
  icon: LucideIcon;
}

const ROUTE_STATUS_META: Record<VehicleBoardStatus, RouteStatusMeta> = {
  w_trasie: { variant: 'success', icon: Truck },
  zjechal: { variant: 'muted', icon: ParkingSquare },
  // `nieznany` has no <Badge variant> — it renders the fill-less "outline"
  // treatment below (§7.5.1: more recessive than `muted`).
  nieznany: { icon: HelpCircle },
};

export interface VehicleRouteStatusBadgeProps {
  status: VehicleBoardStatus;
  className?: string;
}

export function VehicleRouteStatusBadge({
  status,
  className,
}: VehicleRouteStatusBadgeProps) {
  const t = useTranslations('weryfikator.vehicles.status');
  const meta = ROUTE_STATUS_META[status];
  const Icon = meta.icon;
  const label = t(status);

  if (meta.variant) {
    return (
      <Badge variant={meta.variant} className={cn('gap-1', className)}>
        <Icon size={12} aria-hidden />
        {label}
      </Badge>
    );
  }

  // `nieznany` — fill-less "outline" badge (existing tokens, no new variant).
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5',
        'bg-transparent text-xs font-bold text-text-sub',
        className,
      )}
    >
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}
