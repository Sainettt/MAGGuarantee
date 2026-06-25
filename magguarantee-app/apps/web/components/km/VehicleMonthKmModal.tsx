'use client';

// <VehicleMonthKmModal> — read-only monthly km-calendar for ONE vehicle
// (docs/14-design-system.md §7.7.6). Opened by the km-board row click; replaces
// the former flat <VehicleKmHistoryDialog> list with a Monday-first month grid.
//
// READ-ONLY FOR ALL ROLES (incl. weryfikator). Editing stays on the weekly
// board — this modal never mutates. It reuses the board's <KmCell mode="view">
// verbatim, so the three drove/idle/empty visuals (and their i18n labels) match
// the board exactly; no new tokens are introduced.
//
// Month paging is bounded: lower bound = the vehicle's createdAt month, upper
// bound = the current (Europe/Warsaw business) month. `prev`/`next` disable at
// the bounds. Future days of the current month, and days before createdAt in
// the first month, render as dimmed out-of-range empty cells.

import { ChevronLeft, ChevronRight, Gauge } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type {
  VehicleKmBoardItemDto,
  VehicleKmCellDto,
} from '@magguarantee/shared';

import { KmCell } from '@/components/km/KmCell';
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
import { Skeleton } from '@/components/ui/Skeleton';
import { useVehicleDailyKmHistory } from '@/lib/hooks/useVehicleKm';
import {
  addMonths,
  canNext,
  canPrev,
  endOfMonthIso,
  monthDays,
  monthKey,
  startOfMonthIso,
  todayIso,
  weekdayIndexMonFirst,
} from '@/lib/format/month';
import { formatDayMonth, formatDayMonthYear } from '@/lib/format/week';
import { cn } from '@/lib/utils';

const WEEKDAY_KEYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

/** «czerwiec 2026» → «Czerwiec 2026» — PL `Intl` lowercases month names. */
function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

interface Props {
  /** The vehicle whose monthly km to show; `null` keeps the dialog closed. */
  vehicle: VehicleKmBoardItemDto | null;
  onOpenChange: (open: boolean) => void;
}

export function VehicleMonthKmModal({ vehicle, onOpenChange }: Props) {
  const t = useTranslations('weryfikator.km.month');
  const tWeekday = useTranslations('weryfikator.km.weekday');
  const tAria = useTranslations('weryfikator.km.aria');
  const tCell = useTranslations('weryfikator.km.cell');
  const format = useFormatter();

  const open = vehicle != null;

  // Bounds (string `YYYY-MM` keys — lexical = chronological).
  const todayMonthKey = monthKey(todayIso());
  const createdAtMonthKey = vehicle ? monthKey(vehicle.createdAt) : todayMonthKey;

  // The shown month, anchored to its 1st (`YYYY-MM-01`). Initial = current
  // month, clamped up to the createdAt month for a vehicle created this month
  // (createdAt can never be in the future, so only the lower clamp can bite).
  const initialMonth = useMemo(() => {
    const current = startOfMonthIso(todayIso());
    return monthKey(current) < createdAtMonthKey
      ? startOfMonthIso(`${createdAtMonthKey}-01`)
      : current;
  }, [createdAtMonthKey]);

  const [month, setMonth] = useState(initialMonth);

  // Reset to the current month when a DIFFERENT vehicle opens the modal (the
  // bounds change with the vehicle, so a stale month could be out of range).
  // Keyed on the vehicle ID — NOT the whole `vehicle` object, whose identity
  // changes on every board refetch and would needlessly reset the shown month.
  const vehicleId = vehicle?.id ?? null;
  useEffect(() => {
    if (vehicleId) setMonth(initialMonth);
  }, [vehicleId, initialMonth]);

  const currentMonthKey = monthKey(month);
  const monthStart = startOfMonthIso(month);
  const monthEnd = endOfMonthIso(month);

  // The hook's query key includes from/to, so changing month re-fetches.
  const { data, isLoading } = useVehicleDailyKmHistory(vehicle?.id, {
    from: monthStart,
    to: monthEnd,
  });

  // Sparse response → Map<dateString, cell>. Days with no row get an empty cell.
  const cellByDate = useMemo(() => {
    const map = new Map<string, VehicleKmCellDto>();
    for (const row of data ?? []) {
      const date = row.date.slice(0, 10);
      map.set(date, {
        date,
        state: row.state,
        km: row.km,
        notes: row.notes,
      });
    }
    return map;
  }, [data]);

  const days = useMemo(() => monthDays(month), [month]);

  // Leading blanks before day 1 (Mon-first) + trailing blanks to fill the week.
  const leadingBlanks = monthStart ? weekdayIndexMonFirst(monthStart) : 0;
  const trailingBlanks = (7 - ((leadingBlanks + days.length) % 7)) % 7;

  // Σ km over `drove` rows in the month — the footer total.
  const monthKmSum = useMemo(
    () =>
      (data ?? []).reduce(
        (sum, row) => sum + (row.state === 'drove' ? (row.km ?? 0) : 0),
        0,
      ),
    [data],
  );

  const today = todayIso();
  const prevDisabled = !canPrev(currentMonthKey, createdAtMonthKey);
  const nextDisabled = !canNext(currentMonthKey, todayMonthKey);

  const monthLabel = capitalizeFirst(
    format.dateTime(new Date(`${monthStart}T00:00:00Z`), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  );

  const sideLabel = vehicle?.sideNumber ?? '—';
  const carrierLabel = vehicle?.carrier?.name ?? '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t('title', { plate: vehicle.plateNumber, side: sideLabel })}
            </DialogTitle>
            <DialogDescription>
              {t('desc', { carrier: carrierLabel })}
            </DialogDescription>
          </DialogHeader>

          {/* Month nav — ‹ {Month YYYY} › */}
          <div className="mb-3 flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 px-0"
              aria-label={t('prev')}
              disabled={prevDisabled}
              onClick={() => setMonth(addMonths(month, -1))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <span
              className="min-w-[10rem] text-center text-sm font-semibold text-text"
              aria-live="polite"
            >
              {monthLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 px-0"
              aria-label={t('next')}
              disabled={nextDisabled}
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="grid grid-cols-7 gap-1" aria-hidden="true">
                {Array.from({ length: 35 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <table
                className="w-full table-fixed border-separate border-spacing-1"
                aria-label={t('gridLabel', { month: monthLabel })}
              >
                <thead>
                  <tr>
                    {WEEKDAY_KEYS.map((key) => (
                      <th
                        key={key}
                        scope="col"
                        className="pb-1 text-center text-xs font-medium text-text-sub"
                      >
                        {tWeekday(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chunk(
                    [
                      ...Array.from({ length: leadingBlanks }, () => null),
                      ...days,
                      ...Array.from({ length: trailingBlanks }, () => null),
                    ],
                    7,
                  ).map((week, wi) => (
                    <tr key={wi}>
                      {week.map((date, di) => {
                        if (date == null) {
                          return (
                            <td
                              key={`blank-${wi}-${di}`}
                              className="h-12"
                              aria-hidden="true"
                            />
                          );
                        }

                        const inRange =
                          date >= `${createdAtMonthKey}-01` && date <= today;
                        const cell: VehicleKmCellDto =
                          cellByDate.get(date) ?? {
                            date,
                            state: null,
                            km: null,
                            notes: null,
                          };
                        const weekday = tWeekday(
                          WEEKDAY_KEYS[weekdayIndexMonFirst(date)],
                        );
                        const dayNum = Number(date.slice(8, 10));
                        const stateLabel =
                          cell.state === 'drove'
                            ? tCell('drove')
                            : cell.state === 'idle'
                              ? tCell('idle')
                              : tCell('empty');

                        return (
                          <td key={date} className="relative p-0 align-top">
                            <span
                              className="pointer-events-none absolute left-1 top-0.5 z-10 text-[10px] font-medium tabular-nums text-text-sub"
                              aria-hidden="true"
                            >
                              {dayNum}
                            </span>
                            {/* KmCell renders a <td>; an inner single-row table
                                isolates it so it's reused verbatim (no edits),
                                while THIS <td> owns the day-number overlay. */}
                            <table
                              className={cn(
                                'w-full',
                                inRange ? undefined : 'opacity-40',
                              )}
                            >
                              <tbody>
                                <tr>
                                  <KmCell
                                    cell={cell}
                                    mode="view"
                                    ariaLabel={tAria('cell', {
                                      plate: vehicle.plateNumber,
                                      weekday,
                                      date: formatDayMonthYear(date),
                                      state: stateLabel,
                                    })}
                                  />
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!isLoading && monthKmSum === 0 && cellByDate.size === 0 ? (
              <EmptyState
                icon={Gauge}
                message={t('emptyMonth')}
                className="py-8"
              />
            ) : null}
          </div>

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-text-sub">{t('sumLabel')}</span>
              <span className="font-mono font-semibold tabular-nums text-text">
                {monthKmSum}
              </span>
              <span className="text-xs text-text-sub">
                {tCell('kmPlaceholder')}
              </span>
            </div>
            <span className="text-xs tabular-nums text-text-sub">
              {t('range', {
                from: formatDayMonth(monthStart),
                to: formatDayMonth(monthEnd),
              })}
            </span>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** Splits `items` into consecutive groups of `size` (the last may be shorter). */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
