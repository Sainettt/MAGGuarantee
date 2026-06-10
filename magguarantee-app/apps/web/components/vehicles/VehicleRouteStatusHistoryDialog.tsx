'use client';

// Phase 7.5 — read-only per-vehicle route-status history
// (docs/14-design-system.md §7.5.5).
//
// Opened by a row-click on the weryfikator board. Shows the append-only log for
// one vehicle, newest-first: status badge / actor (or «GPS») + source pill /
// timestamp / optional notes. Read-only — stamping happens from the table row,
// not here (one mutation entry-point). Dismiss-only footer.

import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleRouteBoardItemDto } from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { VehicleRouteStatusBadge } from '@/components/vehicles/VehicleRouteStatusBadge';
import { useVehicleRouteStatusHistory } from '@/lib/hooks/useVehicleRouteStatus';
import { formatDateTime } from '@/lib/format/numbers';
import { cn } from '@/lib/utils';

interface Props {
  /** The board row the dialog opens for; `null` keeps the dialog closed. */
  vehicle: VehicleRouteBoardItemDto | null;
  onOpenChange: (open: boolean) => void;
}

export function VehicleRouteStatusHistoryDialog({ vehicle, onOpenChange }: Props) {
  const t = useTranslations('weryfikator.vehicles.history');
  const tCommon = useTranslations('common');

  const open = vehicle !== null;
  const { data, isLoading } = useVehicleRouteStatusHistory(vehicle?.id ?? null);

  const sideSuffix = vehicle?.sideNumber
    ? t('sideSuffix', { side: vehicle.sideNumber })
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('title', { plate: vehicle?.plateNumber ?? '—' })}
          </DialogTitle>
          <DialogDescription>
            {vehicle?.opiekun?.name ?? t('noOpiekun')}
            {sideSuffix}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[55vh] overflow-y-auto px-1">
          {isLoading && (
            <p className="py-10 text-center text-sm text-text-sub">
              {tCommon('loading')}
            </p>
          )}

          {!isLoading && (data?.length ?? 0) === 0 && (
            <EmptyState
              icon={History}
              title={t('emptyTitle')}
              message={t('emptyMessage')}
            />
          )}

          {!isLoading && data && data.length > 0 && (
            <ul className="divide-y divide-border">
              {data.map((entry, index) => {
                const isLatest = index === 0;
                return (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <VehicleRouteStatusBadge status={entry.status} />
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-sm',
                            isLatest
                              ? 'font-medium text-text'
                              : 'text-text-sub',
                          )}
                        >
                          {entry.notedBy?.name ?? t('gpsActor')}
                        </span>
                        <Badge variant="muted" className="text-[10px]">
                          {t(`source.${entry.source}`)}
                        </Badge>
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-text-sub">{entry.notes}</p>
                      )}
                    </div>
                    <time
                      className={cn(
                        'shrink-0 text-right text-xs tabular-nums',
                        isLatest ? 'text-text' : 'text-text-sub',
                      )}
                      dateTime={entry.notedAt}
                    >
                      {formatDateTime(entry.notedAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {tCommon('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
