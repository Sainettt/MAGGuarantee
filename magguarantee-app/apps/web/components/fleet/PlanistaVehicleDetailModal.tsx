'use client';

// Phase 6.4 — <PlanistaVehicleDetailModal>. The planista fleet panel shows the
// FULL admin-style vehicle detail (incl. «Stawki» rates + «Opiekun»), unlike the
// slim <FleetVehicleDetailModal> the dyspozytor stays on (docs/14 §6.4.2).
//
// The slim fleet `VehicleListItem` the panel holds carries no rates and no
// opiekun, so this wrapper fetches the full `VehicleDto` by id (`useVehicle`)
// and feeds it into the shared read-only <VehicleDetailModal>. It is read-only:
// no `onEdit` (planista cannot edit) and NO `hideCarrier` — planista should see
// who the carrier is.
//
// The fetch is by-id and only runs once a row is clicked. To avoid a "dead
// click" (the modal would otherwise wait for the network before appearing), a
// minimal loading Dialog shell is shown while the query is in flight and no data
// has arrived yet — so the modal opens INSTANTLY on click, then swaps to the
// full detail once the DTO resolves.

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/Dialog';
import { VehicleDetailModal } from '@/components/vehicles/VehicleDetailModal';
import { useVehicle } from '@/lib/hooks/useVehicles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target vehicle id — `null` when no row is selected (query disabled). */
  vehicleId: string | null;
}

export function PlanistaVehicleDetailModal({
  open,
  onOpenChange,
  vehicleId,
}: Props) {
  const tCommon = useTranslations('common');
  // `useVehicle` is enabled only when `vehicleId` is set (Boolean(id) guard).
  const { data, isLoading } = useVehicle(open ? vehicleId : null);

  // Modal open but the full DTO hasn't arrived yet → show a brief loading shell
  // so the click feels instant. Once `data` lands we render the full detail.
  if (open && !data) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-[17px] font-bold leading-tight text-text">
            {tCommon('loading')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tCommon('loading')}
          </DialogDescription>
          <div
            className="flex items-center justify-center py-10"
            aria-busy={isLoading}
          >
            <Loader2
              size={24}
              className="animate-spin text-text-sub"
              aria-hidden="true"
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Read-only full detail — no `onEdit`, and NO `hideCarrier` (planista sees the
  // carrier). When `open` is false, <VehicleDetailModal> stays closed.
  return (
    <VehicleDetailModal
      open={open}
      onOpenChange={onOpenChange}
      vehicle={data ?? null}
    />
  );
}
