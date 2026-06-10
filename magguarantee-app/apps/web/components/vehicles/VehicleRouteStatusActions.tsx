'use client';

// Phase 7.5 — per-row re-stampable status actions for the weryfikator board
// (docs/14-design-system.md §7.5.4).
//
// TWO buttons on EVERY row, always present & always enabled — this is a daily
// ledger, NOT a state machine (each click appends a history row). Posture:
//   • Quiet `outline` buttons (NOT brand-red) — stamping happens many times a
//     day; the colour signal lives in the status badge, not the buttons.
//   • The button matching today's latest stamp renders `aria-pressed` + a
//     semantic accent (success fill for w_trasie, muted fill for zjechal) but
//     STAYS CLICKABLE — re-stamping / re-confirming is allowed; never disabled.
//   • No confirm dialog — low-stakes, high-frequency. Click → POST → toast →
//     board invalidate; on error a destructive toast (parent handles).
//   • Buttons `stopPropagation` so a stamp doesn't also open the row's history.
//   • Narrow viewports collapse to icon-only (label kept as aria-label).

import { ParkingSquare, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  VehicleBoardStatus,
  VehicleRouteStatusValue,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface Props {
  /** Today's derived status — drives which button reads as "current". */
  currentStatus: VehicleBoardStatus;
  /** Fired with the chosen stored status; parent runs the mutation + toast. */
  onStamp: (status: VehicleRouteStatusValue) => void;
  /** Disables both buttons while this row's stamp is in flight. */
  isPending?: boolean;
}

const STAMP_ACTIONS: {
  status: VehicleRouteStatusValue;
  icon: typeof Truck;
  /** Accent applied when this is the current status (still clickable). */
  activeClass: string;
}[] = [
  {
    status: 'w_trasie',
    icon: Truck,
    activeClass:
      'border-success bg-success-bg text-success-dark hover:bg-success-bg dark:bg-success/15 dark:text-success',
  },
  {
    status: 'zjechal',
    icon: ParkingSquare,
    activeClass: 'border-border bg-input text-text hover:bg-input',
  },
];

export function VehicleRouteStatusActions({
  currentStatus,
  onStamp,
  isPending,
}: Props) {
  const t = useTranslations('weryfikator.vehicles.actions');

  return (
    <div className="flex justify-end gap-2">
      {STAMP_ACTIONS.map(({ status, icon: Icon, activeClass }) => {
        const isCurrent = currentStatus === status;
        const label = t(status);
        return (
          <Button
            key={status}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={isCurrent}
            aria-label={label}
            disabled={isPending}
            onClick={(e) => {
              // Don't also open the row's history dialog.
              e.stopPropagation();
              onStamp(status);
            }}
            className={cn(isCurrent && activeClass)}
          >
            <Icon size={14} aria-hidden />
            {/* Label hides below sm → icon-only (aria-label keeps it labelled). */}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
