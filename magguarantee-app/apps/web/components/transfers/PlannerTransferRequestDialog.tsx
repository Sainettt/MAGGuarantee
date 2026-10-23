'use client';

// docs/14 §17.3 — <PlannerTransferRequestDialog>: «Wniosek o zmianę planisty».
// A confirm-with-input dialog (§7.10.2), not a 900px <FormDialog>.
//
// Two entries, one dialog:
//   * `vehicle` given — from the vehicle form (opiekun E1 / admin E2) or the
//     detail-modal footer (the vehicle's current planista, §17.6.3). The
//     vehicle is fixed.
//   * `vehicle` omitted — the «Przekaż ciągnik» CTA on «Moje wnioski» (planista):
//     a «Ciągnik» select of his own ACTIVE vehicles without his pending request.
//
// Nothing is notified (R9): the info line says so, so the author does not wait
// for a mail. An admin reads `request.infoAdmin` instead — he can't approve
// his own request (R4), and with no other admin / lider it can only be
// cancelled. Everything the user must READ after a refusal (409 / 422 / 403)
// stays inside the open dialog; only network / 5xx failures toast.
//
// When opened over the vehicle form the dialog is a STACKED overlay: Escape
// closes only this one (`overlayStack`), focus returns to the trigger, and the
// submit event is stopped here so it never bubbles (through the React portal)
// into the vehicle form's own onSubmit.

import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/Form';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { LockNotice } from '@/components/ui/LockNotice';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTransferTargets } from '@/lib/hooks/useLookups';
import {
  PENDING_PAGE_LIMIT,
  useInvalidateTransferViews,
  usePlannerTransfers,
  useRequestPlannerTransfer,
} from '@/lib/hooks/usePlannerTransfers';
import { useVehicles } from '@/lib/hooks/useVehicles';
import {
  PLANNER_TRANSFER_REASON_MAX,
  requestFormSchema,
  type RequestFormValues,
} from '@/lib/transfers/transferForms';
import {
  requestErrorKind,
  type RequestErrorKind,
} from '@/lib/transfers/transferErrors';
import { personName } from '@/lib/transfers/transferUi';

/** The fixed vehicle of the first entry. */
export interface TransferRequestVehicle {
  id: string;
  plateNumber: string;
  /** Carrier `name ?? login`; `null` when unknown. */
  carrierName: string | null;
  /** The CURRENT planista, `name ?? login`. */
  plannerName: string;
}

export interface PlannerTransferRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed vehicle (first entry). Omit → the planista picks one of his own. */
  vehicle?: TransferRequestVehicle | null;
  /** Opened over the vehicle form → the «independent of Zapisz» line. */
  fromForm?: boolean;
}

/** Refusals shown in the footer slot (the rest go to a field or a toast). */
type InlineError = Exclude<RequestErrorKind, 'generic' | 'reasonInvalid'>;

const INLINE_ERROR_KEY: Record<InlineError, string> = {
  alreadyPending: 'request.errors.alreadyPending',
  targetInvalid: 'request.errors.sameOrInvalidTarget',
  vehicleInactive: 'request.errors.vehicleInactive',
  notAllowed: 'request.errors.notAllowed',
};

export default function PlannerTransferRequestDialog({
  open,
  onOpenChange,
  vehicle = null,
  fromForm = false,
}: PlannerTransferRequestDialogProps) {
  const t = useTranslations('transfers');
  const tCommon = useTranslations('common');
  const { user } = useAuth();
  const pickVehicle = vehicle === null;

  const schema = useMemo(
    () =>
      requestFormSchema(
        {
          vehicleRequired: t('request.vehicleRequired'),
          targetRequired: t('request.targetRequired'),
          reasonRequired: t('request.reasonRequired'),
          reasonTooLong: t('request.reasonTooLong', {
            max: PLANNER_TRANSFER_REASON_MAX,
          }),
        },
        pickVehicle,
      ),
    [t, pickVehicle],
  );

  const form = useForm<RequestFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { vehicleId: vehicle?.id ?? '', toPlannerId: '', reason: '' },
  });

  const [inlineError, setInlineError] = useState<InlineError | null>(null);
  // After a refusal that a retry cannot fix, the primary action is removed
  // and «Anuluj» becomes «Zamknij» (§17.3 table).
  const [blocked, setBlocked] = useState(false);

  const vehicleId = vehicle?.id ?? null;
  useEffect(() => {
    if (!open) return;
    form.reset({ vehicleId: vehicleId ?? '', toPlannerId: '', reason: '' });
    setInlineError(null);
    setBlocked(false);
  }, [open, vehicleId, form]);

  // ── Second entry: the planista's own active vehicles, minus his pending ──
  const ownVehiclesQ = useVehicles(
    { active: true, limit: 200 },
    { enabled: open && pickVehicle },
  );
  const minePendingQ = usePlannerTransfers(
    { scope: 'mine', status: 'pending', limit: PENDING_PAGE_LIMIT },
    { enabled: open && pickVehicle },
  );
  // scope: "his own" = the vehicles whose CURRENT planner is the viewer (id).
  const pickableVehicles = useMemo(() => {
    if (!pickVehicle) return [];
    const pendingIds = new Set(
      (minePendingQ.data?.items ?? []).map((tr) => tr.vehicle.id),
    );
    return (ownVehiclesQ.data?.items ?? []).filter(
      (v) =>
        v.active &&
        (user ? v.plannerId === user.id : true) &&
        !pendingIds.has(v.id),
    );
  }, [pickVehicle, ownVehiclesQ.data, minePendingQ.data, user]);
  const vehiclesLoading =
    pickVehicle && (ownVehiclesQ.isLoading || minePendingQ.isLoading);
  const noVehicles = pickVehicle && !vehiclesLoading && pickableVehicles.length === 0;

  const watchedVehicleId = form.watch('vehicleId');
  const selectedVehicleId = pickVehicle ? watchedVehicleId : vehicleId;
  const selected = useMemo<TransferRequestVehicle | null>(() => {
    if (!pickVehicle) return vehicle;
    const v = pickableVehicles.find((x) => x.id === watchedVehicleId);
    return v
      ? {
          id: v.id,
          plateNumber: v.plateNumber,
          carrierName: v.carrier ? personName(v.carrier) : null,
          plannerName: personName(v.planner),
        }
      : null;
  }, [pickVehicle, vehicle, pickableVehicles, watchedVehicleId]);

  // ── «Nowy planista» — active planisci without the current one (U2) ──
  const targetsQ = useTransferTargets(selectedVehicleId, { enabled: open });
  const targets = targetsQ.data ?? [];
  const targetsLoading = Boolean(selectedVehicleId) && targetsQ.isLoading;
  const noTargets =
    Boolean(selectedVehicleId) && targetsQ.isSuccess && targets.length === 0;

  // §17.10 — focus the first FIELD once its options arrive (the dialog's own
  // initial focus runs before, while the select is still a skeleton).
  const firstFieldReady = pickVehicle ? !vehiclesLoading : targetsQ.isSuccess;
  useEffect(() => {
    if (!open || !firstFieldReady || form.formState.isDirty) return;
    form.setFocus(pickVehicle ? 'vehicleId' : 'toPlannerId');
    // Only on the transition to "ready" — never steal focus afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, firstFieldReady]);

  const requestM = useRequestPlannerTransfer();
  const invalidate = useInvalidateTransferViews();

  const onSubmit = form.handleSubmit(async (values) => {
    const targetVehicleId = pickVehicle ? values.vehicleId : vehicleId;
    if (!targetVehicleId) return;
    setInlineError(null);
    try {
      await requestM.mutateAsync({
        vehicleId: targetVehicleId,
        body: { toPlannerId: values.toPlannerId, reason: values.reason.trim() },
      });
      toast.success(t('request.success'));
      onOpenChange(false);
    } catch (err) {
      const kind = requestErrorKind(err);
      switch (kind) {
        case 'generic':
          toast.error(t('request.errors.generic'));
          return;
        case 'reasonInvalid':
          form.setError('reason', { message: t('request.reasonRequired') });
          return;
        case 'alreadyPending':
          // The host now shows the pending notice; a retry is pointless.
          invalidate(targetVehicleId);
          setInlineError(kind);
          setBlocked(true);
          return;
        case 'targetInvalid':
          form.setValue('toPlannerId', '', { shouldValidate: true });
          void targetsQ.refetch();
          setInlineError(kind);
          return;
        case 'vehicleInactive':
        case 'notAllowed':
          setInlineError(kind);
          setBlocked(true);
          return;
      }
    }
  });

  const submitting = requestM.isPending;
  const reasonLength = form.watch('reason').length;
  const canSubmit =
    form.formState.isValid && !submitting && !noTargets && !noVehicles;

  const vehicleSelect = form.register('vehicleId', {
    onChange: () => {
      // Another vehicle → another current planista → another target list.
      form.setValue('toPlannerId', '');
      setInlineError(null);
      setBlocked(false);
    },
  });

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form
          noValidate
          onSubmit={(e) => {
            // Never let the submit bubble (via the portal) into a host form.
            e.stopPropagation();
            void onSubmit(e);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('request.title')}</DialogTitle>
            <DialogDescription>
              {selected ? (
                <>
                  <span className="font-mono">{selected.plateNumber}</span>
                  {selected.carrierName ? ` · ${selected.carrierName}` : null}
                </>
              ) : (
                '—'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {pickVehicle && (
              <FormField
                label={t('request.vehicle')}
                required
                htmlFor="transfer-vehicle"
                error={errors.vehicleId?.message}
                description={noVehicles ? t('request.noVehicles') : undefined}
              >
                {vehiclesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    id="transfer-vehicle"
                    disabled={noVehicles || submitting}
                    {...vehicleSelect}
                  >
                    <option value="">{t('request.vehiclePlaceholder')}</option>
                    {pickableVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {t('request.vehicleOption', {
                          plate: v.plateNumber,
                          side: v.sideNumber ?? '—',
                          carrier: v.carrier ? personName(v.carrier) : '—',
                        })}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
            )}

            {/* §6.5 «value is text» — a static pair, not an input. */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              <dt className="text-text-sub">{t('request.currentPlanner')}</dt>
              <dd className="font-medium text-text">
                {selected?.plannerName ?? '—'}
              </dd>
            </dl>

            <FormField
              label={t('request.target')}
              required
              htmlFor="transfer-target"
              error={errors.toPlannerId?.message}
              description={noTargets ? t('request.noTargets') : undefined}
            >
              {targetsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  id="transfer-target"
                  disabled={!selectedVehicleId || noTargets || submitting}
                  {...form.register('toPlannerId', {
                    onChange: () => {
                      if (inlineError === 'targetInvalid') setInlineError(null);
                    },
                  })}
                >
                  <option value="">{t('request.targetPlaceholder')}</option>
                  {targets.map((u) => (
                    <option key={u.id} value={u.id}>
                      {personName(u)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <FormField
              label={t('request.reason')}
              required
              htmlFor="transfer-reason"
              error={errors.reason?.message}
            >
              <Textarea
                id="transfer-reason"
                rows={3}
                maxLength={PLANNER_TRANSFER_REASON_MAX}
                placeholder={t('request.reasonPlaceholder')}
                aria-describedby="transfer-reason-counter"
                disabled={submitting}
                {...form.register('reason')}
              />
              <p
                id="transfer-reason-counter"
                className="self-end text-xs text-text-sub tabular-nums"
              >
                {t('request.reasonCounter', {
                  count: reasonLength,
                  max: PLANNER_TRANSFER_REASON_MAX,
                })}
              </p>
            </FormField>

            {/* scope: wording per role (who decides the admin's own request). */}
            <LockNotice icon={Info}>
              {user?.role === 'admin' ? t('request.infoAdmin') : t('request.info')}
            </LockNotice>

            {fromForm && (
              <p className="text-xs text-text-sub">
                {t('request.independentOfForm')}
              </p>
            )}
          </div>

          <DialogFooter className="flex-wrap">
            {inlineError && (
              <p className="mr-auto text-sm text-danger" role="alert">
                {t(INLINE_ERROR_KEY[inlineError])}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {blocked ? tCommon('close') : tCommon('cancel')}
            </Button>
            {!blocked && (
              <Button type="submit" size="sm" disabled={!canSubmit}>
                {submitting ? t('request.submitting') : t('request.submit')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { PlannerTransferRequestDialog };
