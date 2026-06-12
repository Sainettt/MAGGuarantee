'use client';

// <VehicleKmHistoryDialog> — read-only per-vehicle daily-km log
// (docs/14-design-system.md §7.7.6). Opened by the grid's «Historia» button.
// A centered <Dialog> showing `GET /vehicles/:id/daily-km`, newest-first. The
// km-board is the single mutating surface — history is strictly read-only.

import { Check, ParkingSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleKmBoardItemDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
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
import { useVehicleDailyKmHistory } from '@/lib/hooks/useVehicleKm';
import { formatDayMonth, weekdayIndexMonFirst } from '@/lib/format/week';

const WEEKDAY_KEYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

interface Props {
  /** The vehicle whose history to show; `null` keeps the dialog closed. */
  vehicle: VehicleKmBoardItemDto | null;
  onOpenChange: (open: boolean) => void;
}

export function VehicleKmHistoryDialog({ vehicle, onOpenChange }: Props) {
  const t = useTranslations('weryfikator.km.history');
  const tWeekday = useTranslations('weryfikator.km.weekday');
  const tCell = useTranslations('weryfikator.km.cell');

  const { data, isLoading } = useVehicleDailyKmHistory(vehicle?.id);

  const open = vehicle != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t('title', { plate: vehicle.plateNumber })}
            </DialogTitle>
            <DialogDescription>
              {t('desc', {
                side: vehicle.sideNumber ?? '—',
                carrier: vehicle.carrier?.name ?? '—',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <ul className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <div className="h-8 w-12 rounded bg-input animate-pulse" />
                    <div className="h-5 w-20 rounded bg-input animate-pulse" />
                  </li>
                ))}
              </ul>
            ) : !data || data.length === 0 ? (
              <EmptyState icon={ParkingSquare} message={t('empty')} />
            ) : (
              <ul className="divide-y divide-border">
                {data.map((row) => {
                  const weekday = tWeekday(
                    WEEKDAY_KEYS[weekdayIndexMonFirst(row.date)],
                  );
                  return (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <div className="shrink-0">
                        <p className="text-sm font-medium tabular-nums text-text">
                          {formatDayMonth(row.date)}
                        </p>
                        <p className="text-xs text-text-sub">{weekday}</p>
                      </div>

                      <div className="min-w-0 flex-1">
                        {row.state === 'drove' ? (
                          <span className="inline-flex items-center gap-1">
                            <Check
                              size={14}
                              className="text-success"
                              aria-hidden="true"
                            />
                            <span className="font-mono font-semibold tabular-nums text-text">
                              {row.km ?? 0}
                            </span>
                            <span className="text-xs text-text-sub">
                              {tCell('kmPlaceholder')}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-text-sub">
                            <ParkingSquare size={12} aria-hidden="true" />
                            {tCell('idle')}
                          </span>
                        )}
                        {row.notes ? (
                          <p className="mt-0.5 text-xs text-text-sub">
                            {row.notes}
                          </p>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-xs text-text-sub">
                          {row.notedBy?.name ?? t('sourceGps')}
                        </p>
                        <Badge variant="muted" className="mt-0.5 text-[10px]">
                          {row.source === 'gps'
                            ? t('sourceGps')
                            : t('sourceManual')}
                        </Badge>
                      </div>
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
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
