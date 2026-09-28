'use client';

// docs/14 §17.6.4 — «Historia planistów — {plate}» opened from a request card.
// For a planista lider this is the ONLY way to the journal (his scope over the
// vehicle is not widened, docs/29 §9). The query runs only while open.

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useVehiclePlannerHistory } from '@/lib/hooks/usePlannerTransfers';

import { PlannerHistoryTimeline } from './PlannerHistoryTimeline';

export interface PlannerHistoryDialogProps {
  /** `null` = closed. */
  target: { vehicleId: string; plate: string; carrierName?: string | null } | null;
  onOpenChange: (open: boolean) => void;
}

export default function PlannerHistoryDialog({
  target,
  onOpenChange,
}: PlannerHistoryDialogProps) {
  const t = useTranslations('transfers.history');
  const tCommon = useTranslations('common');
  const open = target !== null;
  const q = useVehiclePlannerHistory(target?.vehicleId ?? null, { enabled: open });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col p-0">
        <div className="shrink-0 border-b border-border px-6 pb-4 pt-6 pr-12">
          <DialogHeader className="mb-0">
            <DialogTitle>
              {t('dialogTitle', { plate: target?.plate ?? '' })}
            </DialogTitle>
            <DialogDescription>
              <span className="font-mono">{target?.plate}</span>
              {target?.carrierName ? ` · ${target.carrierName}` : null}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <PlannerHistoryTimeline
            plate={target?.plate ?? ''}
            history={q.data}
            isLoading={q.isLoading}
            error={q.error}
            onRetry={() => void q.refetch()}
            isRetrying={q.isFetching}
          />
        </div>
        <div className="shrink-0 border-t border-border px-6 py-3">
          <DialogFooter className="mt-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px] sm:min-h-0"
              onClick={() => onOpenChange(false)}
            >
              {tCommon('close')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { PlannerHistoryDialog };
