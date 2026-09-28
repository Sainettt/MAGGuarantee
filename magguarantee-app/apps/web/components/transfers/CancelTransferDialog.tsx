'use client';

// docs/14 §17.5.6 — «Anulować wniosek?». The existing destructive
// <ConfirmDialog>; its close button reads «Wróć» — next to «Anuluj wniosek» a
// second «Anuluj» would read as the same action.
//
//   200 → toast.success(cancel.success), close;
//   409 (already decided) → toast.error(cancel.errors.notPending) + refresh,
//       close — there is nothing left to cancel;
//   anything else → toast.error(cancel.errors.generic), stay open (retry).

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { PlannerTransferDto } from '@magguarantee/shared';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useCancelPlannerTransfer,
  useInvalidateTransferViews,
} from '@/lib/hooks/usePlannerTransfers';
import { cancelErrorKind } from '@/lib/transfers/transferErrors';
import { personName } from '@/lib/transfers/transferUi';

export interface CancelTransferDialogProps {
  /** The request to cancel; `null` = closed. */
  transfer: PlannerTransferDto | null;
  onOpenChange: (open: boolean) => void;
}

export default function CancelTransferDialog({
  transfer,
  onOpenChange,
}: CancelTransferDialogProps) {
  const t = useTranslations('transfers.cancel');
  const cancelM = useCancelPlannerTransfer();
  const invalidate = useInvalidateTransferViews();

  return (
    <ConfirmDialog
      open={transfer !== null}
      onOpenChange={onOpenChange}
      title={t('title')}
      body={
        transfer
          ? t('body', {
              plate: transfer.vehicle.plateNumber,
              to: personName(transfer.toPlanner),
            })
          : ''
      }
      confirmLabel={t('confirm')}
      cancelLabel={t('back')}
      onConfirm={async () => {
        if (!transfer) return;
        try {
          await cancelM.mutateAsync({ transfer });
          toast.success(t('success'));
        } catch (err) {
          if (cancelErrorKind(err) === 'notPending') {
            toast.error(t('errors.notPending'));
            invalidate(transfer.vehicle.id);
            return; // resolve → the dialog closes: nothing left to cancel.
          }
          toast.error(t('errors.generic'));
          throw err; // reject → the dialog stays open for a retry.
        }
      }}
    />
  );
}

export { CancelTransferDialog };
