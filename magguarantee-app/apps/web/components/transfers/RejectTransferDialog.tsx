'use client';

// docs/14 §17.5.5 — «Odrzucić wniosek?». Required rejection reason (U3) with
// the hint that the requester will read it on his list — with no mail or chat
// (R9) that list is his only way to learn why. Destructive primary.
//
// A stale request can still be rejected (the api does not re-check U6 on
// reject), so only a 409 «already decided» / 403 block the primary action.

import { zodResolver } from '@hookform/resolvers/zod';
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
import { Textarea } from '@/components/ui/Textarea';
import {
  useInvalidateTransferViews,
  useRejectPlannerTransfer,
} from '@/lib/hooks/usePlannerTransfers';
import {
  PLANNER_TRANSFER_REASON_MAX,
  rejectFormSchema,
  type RejectFormValues,
} from '@/lib/transfers/transferForms';
import {
  decisionErrorKind,
  type DecisionErrorKind,
} from '@/lib/transfers/transferErrors';
import { personName } from '@/lib/transfers/transferUi';

import { DECISION_ERROR_KEY } from './ApproveTransferDialog';

type InlineError = Exclude<DecisionErrorKind, 'generic' | 'reasonInvalid'>;

export interface RejectTransferDialogProps {
  /** The request to reject; `null` = closed. */
  transfer: PlannerTransferDto | null;
  onOpenChange: (open: boolean) => void;
}

export default function RejectTransferDialog({
  transfer,
  onOpenChange,
}: RejectTransferDialogProps) {
  const t = useTranslations('transfers');
  const tCommon = useTranslations('common');
  const open = transfer !== null;

  const schema = useMemo(
    () =>
      rejectFormSchema({
        reasonRequired: t('request.reasonRequired'),
        reasonTooLong: t('request.reasonTooLong', {
          max: PLANNER_TRANSFER_REASON_MAX,
        }),
      }),
    [t],
  );
  const form = useForm<RejectFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { reason: '' },
  });

  const [inlineError, setInlineError] = useState<InlineError | null>(null);
  const transferId = transfer?.id ?? null;
  useEffect(() => {
    if (!transferId) return;
    form.reset({ reason: '' });
    setInlineError(null);
  }, [transferId, form]);

  const rejectM = useRejectPlannerTransfer();
  const invalidate = useInvalidateTransferViews();

  const onSubmit = form.handleSubmit(async (values) => {
    if (!transfer) return;
    setInlineError(null);
    try {
      await rejectM.mutateAsync({ transfer, reason: values.reason.trim() });
      toast.success(t('reject.success'));
      onOpenChange(false);
    } catch (err) {
      const kind = decisionErrorKind(err);
      if (kind === 'generic') {
        toast.error(t('decisionErrors.generic'));
        return;
      }
      if (kind === 'reasonInvalid') {
        form.setError('reason', { message: t('request.reasonRequired') });
        return;
      }
      if (kind === 'stale') invalidate(transfer.vehicle.id);
      setInlineError(kind);
    }
  });

  const submitting = rejectM.isPending;
  const blocked = inlineError !== null;
  const reasonLength = form.watch('reason').length;

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
            <DialogTitle>{t('reject.title')}</DialogTitle>
            <DialogDescription>
              {transfer
                ? t('reject.description', {
                    plate: transfer.vehicle.plateNumber,
                    from: personName(transfer.fromPlanner),
                    to: personName(transfer.toPlanner),
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormField
              label={t('reject.reason')}
              required
              htmlFor="transfer-reject-reason"
              description={t('reject.reasonHint')}
              error={form.formState.errors.reason?.message}
            >
              <Textarea
                id="transfer-reject-reason"
                rows={3}
                maxLength={PLANNER_TRANSFER_REASON_MAX}
                aria-describedby="transfer-reject-reason-counter"
                disabled={submitting || blocked}
                {...form.register('reason')}
              />
              <p
                id="transfer-reject-reason-counter"
                className="self-end text-xs text-text-sub tabular-nums"
              >
                {t('request.reasonCounter', {
                  count: reasonLength,
                  max: PLANNER_TRANSFER_REASON_MAX,
                })}
              </p>
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
                variant="destructive"
                size="sm"
                disabled={submitting || !form.formState.isValid}
              >
                {t('reject.confirm')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { RejectTransferDialog };
