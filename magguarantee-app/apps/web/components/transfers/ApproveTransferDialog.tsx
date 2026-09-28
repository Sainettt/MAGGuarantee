'use client';

// docs/14 §17.5.5 — «Zatwierdzić przekazanie?». A `max-w-md` <Dialog> on the
// §7.10.2 recipe: close on success, stay open on failure.
//
// The consequence list is R5/R6 in plain words — after the click the vehicle
// is the new planista's at once, not-yet-departed trips move with it, a trip
// «W trasie» stays with the previous planista until it returns. Optional
// comment (U3). Refusals are shown inside the dialog; a stale request (409 —
// decided meanwhile, or the vehicle's planista changed, U6) refreshes the list
// and removes the primary action.

import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { PlannerTransferDto } from '@magguarantee/shared';

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
import { Textarea } from '@/components/ui/Textarea';
import {
  useApprovePlannerTransfer,
  useInvalidateTransferViews,
} from '@/lib/hooks/usePlannerTransfers';
import {
  PLANNER_TRANSFER_REASON_MAX,
  approveFormSchema,
  type ApproveFormValues,
} from '@/lib/transfers/transferForms';
import {
  decisionErrorKind,
  type DecisionErrorKind,
} from '@/lib/transfers/transferErrors';
import { personName } from '@/lib/transfers/transferUi';

type InlineError = Exclude<DecisionErrorKind, 'generic' | 'reasonInvalid'>;

export const DECISION_ERROR_KEY: Record<InlineError, string> = {
  stale: 'decisionErrors.stale',
  targetInactive: 'decisionErrors.targetInactive',
  vehicleInactive: 'decisionErrors.vehicleInactive',
  forbidden: 'decisionErrors.forbidden',
};

export interface ApproveTransferDialogProps {
  /** The request to approve; `null` = closed. */
  transfer: PlannerTransferDto | null;
  onOpenChange: (open: boolean) => void;
}

export default function ApproveTransferDialog({
  transfer,
  onOpenChange,
}: ApproveTransferDialogProps) {
  const t = useTranslations('transfers');
  const tCommon = useTranslations('common');
  const open = transfer !== null;

  const schema = useMemo(
    () =>
      approveFormSchema({
        commentTooLong: t('request.reasonTooLong', {
          max: PLANNER_TRANSFER_REASON_MAX,
        }),
      }),
    [t],
  );
  const form = useForm<ApproveFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { comment: '' },
  });

  const [inlineError, setInlineError] = useState<InlineError | null>(null);
  const transferId = transfer?.id ?? null;
  useEffect(() => {
    if (!transferId) return;
    form.reset({ comment: '' });
    setInlineError(null);
  }, [transferId, form]);

  const approveM = useApprovePlannerTransfer();
  const invalidate = useInvalidateTransferViews();

  const from = transfer ? personName(transfer.fromPlanner) : '';
  const to = transfer ? personName(transfer.toPlanner) : '';

  const onSubmit = form.handleSubmit(async (values) => {
    if (!transfer) return;
    setInlineError(null);
    try {
      await approveM.mutateAsync({ transfer, comment: values.comment });
      toast.success(
        t('approve.success', { plate: transfer.vehicle.plateNumber, to }),
      );
      onOpenChange(false);
    } catch (err) {
      const kind = decisionErrorKind(err);
      if (kind === 'generic' || kind === 'reasonInvalid') {
        toast.error(t('decisionErrors.generic'));
        return;
      }
      if (kind === 'stale') invalidate(transfer.vehicle.id);
      setInlineError(kind);
    }
  });

  const submitting = approveM.isPending;
  // Every inline refusal is final for THIS request — no retry offered.
  const blocked = inlineError !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form
          noValidate
          onSubmit={(e) => {
            e.stopPropagation();
            void onSubmit(e);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('approve.title')}</DialogTitle>
            <DialogDescription>
              {transfer
                ? t('approve.description', {
                    plate: transfer.vehicle.plateNumber,
                    from,
                    to,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <LockNotice icon={Info}>
              <ul className="list-disc space-y-1 pl-4">
                <li>{t('approve.effectVehicle', { to })}</li>
                <li>{t('approve.effectTrips', { from, to })}</li>
                <li>{t('approve.effectHistory', { from })}</li>
              </ul>
            </LockNotice>

            <FormField
              label={t('approve.comment')}
              htmlFor="transfer-approve-comment"
              error={form.formState.errors.comment?.message}
            >
              <Textarea
                id="transfer-approve-comment"
                rows={2}
                maxLength={PLANNER_TRANSFER_REASON_MAX}
                disabled={submitting || blocked}
                {...form.register('comment')}
              />
            </FormField>

            {inlineError && (
              <p className="text-sm text-danger" role="alert">
                {t(DECISION_ERROR_KEY[inlineError])}
              </p>
            )}
          </div>

          <DialogFooter>
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
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !form.formState.isValid}
              >
                {t('approve.confirm')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { ApproveTransferDialog };
