'use client';

// docs/14 §17.2.2 — the «Planista» cell of the vehicle EDIT form. Nobody —
// admin included — changes the planista directly (docs/29 R1): the value is a
// §6.5.13 Tier A locked field (readOnly input + lock glyph + reason), NOT
// registered in RHF, so it can never reach the PATCH body (which the api would
// refuse with 422 VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER).
//
// Under the field (E1–E4, `plannerCellState`):
//   E1 opiekun, active vehicle, no pending → «Poproś o zmianę planisty»
//      (`type="button"` — it lives inside the vehicle <form>); while the
//      history loads a skeleton stands in (never show a button that turns
//      out to be «already pending» a second later);
//   E2 admin, any active vehicle, no pending → the SAME button + skeleton
//      (D9, 2026-10-23), with his own reason: another admin or the current
//      planner's lider decides his request — he never does (R4);
//   E3 switched-off vehicle, any role → «cannot be transferred», no action;
//   E4 pending request → <PendingTransferNotice> (cancel for the author —
//      admin included, with a «who decides» line —, review link for an admin
//      who is not the author).
//
// Rendered as a <FormItem> so it slots into the form's <FormGrid> subgrid
// (label band + control band) like its neighbours.

import { ArrowLeftRight, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleDto } from '@magguarantee/shared';

import { FormDescription, FormItem, FormLabel } from '@/components/forms/Form';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/hooks/useAuth';
import { useVehiclePlannerHistory } from '@/lib/hooks/usePlannerTransfers';
import { pendingTransferOf } from '@/lib/transfers/plannerTimeline';
import { personName, plannerCellState } from '@/lib/transfers/transferUi';

import { PendingTransferNotice } from './PendingTransferNotice';

export interface VehiclePlannerLockedFieldProps {
  vehicle: VehicleDto;
  /** Label of the cell (`vehicles.fields.planner`). */
  label: string;
  /** Whether the host form is open — the history query runs only then. */
  open: boolean;
  /** E1 / E2 — open the request dialog (owned by the host, stacked over the form). */
  onRequest: () => void;
}

export default function VehiclePlannerLockedField({
  vehicle,
  label,
  open,
  onRequest,
}: VehiclePlannerLockedFieldProps) {
  const t = useTranslations('transfers');
  const { user } = useAuth();
  const historyQ = useVehiclePlannerHistory(vehicle.id, { enabled: open });
  const pending = pendingTransferOf(historyQ.data);

  const state = plannerCellState({
    viewerRole: user?.role,
    vehicleActive: vehicle.active,
    history: historyQ.isLoading
      ? 'loading'
      : historyQ.isSuccess
        ? 'ready'
        : 'unavailable',
    hasPending: pending !== null,
  });

  const reasonId = `vehicle-planner-reason-${vehicle.id}`;

  return (
    <FormItem>
      {/* No «*»: the field is not submitted. */}
      <FormLabel htmlFor="vehicle-planner-locked">{label}</FormLabel>
      <div className="relative">
        <Input
          id="vehicle-planner-locked"
          readOnly
          tabIndex={-1}
          aria-readonly="true"
          aria-describedby={reasonId}
          title={t('form.lockedTitle')}
          value={personName(vehicle.planner)}
          className="bg-input/40 pr-9 font-semibold text-text-sub cursor-not-allowed focus:border-border focus:ring-0"
        />
        <Lock
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-text-sub/70"
        />
      </div>
      <FormDescription className="flex items-center gap-1">
        <Lock aria-hidden className="size-3 shrink-0" />
        <span id={reasonId}>{t(`form.${state.reason}`)}</span>
      </FormDescription>
      {state.action === 'skeleton' ? (
        <Skeleton className="h-8 w-48" />
      ) : state.action === 'request' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[44px] self-start gap-1.5 sm:min-h-0"
          onClick={onRequest}
        >
          <ArrowLeftRight size={14} aria-hidden="true" />
          {t('request.button')}
        </Button>
      ) : null}
      {pending ? (
        <PendingTransferNotice
          transfer={pending}
          viewerRole={user?.role}
          viewerId={user?.id}
        />
      ) : null}
    </FormItem>
  );
}

export { VehiclePlannerLockedField };
