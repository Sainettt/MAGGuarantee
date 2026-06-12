'use client';

// <KmWeekGrid mode="edit" | "view"> — the shared weekly km-matrix
// (docs/14-design-system.md §7.7.3). ONE component, two modes (the §6.5
// view/edit precedent) — never fork two grids. Frozen identity block
// (sticky-left) + 7 PN..ND day columns + trailing Σ KM / Notatka / Historia.
// It is NOT a <DataTable> (the matrix layout is too bespoke) but reuses its
// visual grammar (header `bg-bg`, `h-12` rows, `divide-y`, row hover).
//
// Edit mode (board only): clicking a cell opens the modal <KmCellEditorDialog>
// (§7.7.4 REWORK #4). The grid is a pure display surface — it owns no mutation
// and no keyboard cell-chaining; it just reports which (vehicle, cell) was
// activated via `onOpenEditor`, and the screen owns the dialog + commits.

import { History, StickyNote, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type {
  VehicleKmBoardItemDto,
  VehicleKmCellDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/Popover';
import { KmCell } from '@/components/km/KmCell';
import {
  formatDayMonth,
  todayIso,
  weekDays,
  weekdayIndexMonFirst,
} from '@/lib/format/week';
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

interface KmWeekGridProps {
  items: VehicleKmBoardItemDto[];
  /** Monday `YYYY-MM-DD` of the visible week. */
  weekStart: string;
  mode: 'view' | 'edit';
  isLoading?: boolean;
  /** Empty-state when the board/report returns zero rows. */
  emptyTitle: string;
  emptyMessage: string;
  /** Open the modal cell-editor — edit mode only. The screen owns the dialog. */
  onOpenEditor?: (vehicle: VehicleKmBoardItemDto, cell: VehicleKmCellDto) => void;
  /** Open the per-vehicle history dialog. */
  onOpenHistory: (vehicle: VehicleKmBoardItemDto) => void;
}

/** Roll-up notes popover for one row (the NOTATKA column entry-point). */
function RowNotes({ vehicle }: { vehicle: VehicleKmBoardItemDto }) {
  const t = useTranslations('weryfikator.km');
  const tWeekday = useTranslations('weryfikator.km.weekday');
  const [open, setOpen] = useState(false);

  const noted = vehicle.cells.filter((c) => c.notes && c.notes.trim());
  if (noted.length === 0) {
    return (
      <span className="text-text-sub" aria-hidden="true">
        —
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={t('notesPopover.title')}
          className="rounded p-1 text-info hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <StickyNote size={14} aria-hidden="true" />
        </button>
      </PopoverAnchor>
      <PopoverContent className="w-64 p-3">
        <p className="mb-2 text-xs font-semibold text-text-sub">
          {t('notesPopover.title')}
        </p>
        <ul className="space-y-2">
          {noted.map((cell) => (
            <li key={cell.date} className="text-sm">
              <span className="mr-2 font-medium tabular-nums text-text">
                {tWeekday(WEEKDAY_KEYS[weekdayIndexMonFirst(cell.date)])}{' '}
                {formatDayMonth(cell.date)}
              </span>
              <span className="text-text-sub">{cell.notes}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function KmWeekGrid({
  items,
  weekStart,
  mode,
  isLoading,
  emptyTitle,
  emptyMessage,
  onOpenEditor,
  onOpenHistory,
}: KmWeekGridProps) {
  const t = useTranslations('weryfikator.km');
  const tWeekday = useTranslations('weryfikator.km.weekday');
  const tCell = useTranslations('weryfikator.km.cell');

  const days = weekDays(weekStart);
  const today = todayIso();

  // ── Loading skeleton (grid body only; day headers retained by caller) ──
  const skeletonRows = isLoading
    ? Array.from({ length: 7 }).map((_, r) => (
        <tr key={`sk-${r}`} className="h-12">
          <td className="sticky left-0 z-10 bg-card px-3 py-2">
            <div className="h-4 w-24 rounded bg-input animate-pulse" />
            <div className="mt-1 h-3 w-32 rounded bg-input animate-pulse" />
          </td>
          {days.map((d) => (
            <td key={d} className="px-1.5 py-1 text-center">
              <div className="mx-auto h-5 w-10 rounded bg-input animate-pulse" />
            </td>
          ))}
          <td className="bg-input px-3 py-2">
            <div className="ml-auto h-4 w-12 rounded bg-input animate-pulse" />
          </td>
          <td className="px-3 py-2" />
          <td className="px-3 py-2" />
        </tr>
      ))
    : null;

  const showEmpty = !isLoading && items.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      {showEmpty ? (
        <div className="p-6">
          <EmptyState icon={Truck} title={emptyTitle} message={emptyMessage} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full border-collapse text-sm"
            aria-label={t('aria.grid')}
          >
            <thead>
              <tr className="sticky top-0 z-20 bg-bg">
                <th
                  scope="col"
                  className="sticky left-0 z-30 bg-bg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub"
                >
                  {t('col.vehicle')}
                </th>
                {days.map((d) => {
                  const isToday = d === today;
                  const wdIdx = weekdayIndexMonFirst(d);
                  const isWeekend = wdIdx >= 5;
                  return (
                    <th
                      key={d}
                      scope="col"
                      className={cn(
                        'px-1.5 py-2 text-center align-bottom',
                        isWeekend && 'bg-input',
                        isToday && 'border-b-2 border-brand',
                      )}
                    >
                      <span className="block text-xs font-bold uppercase text-text">
                        {tWeekday(WEEKDAY_KEYS[wdIdx])}
                      </span>
                      <span
                        className={cn(
                          'block text-[11px] tabular-nums',
                          isToday
                            ? 'font-semibold text-brand'
                            : 'text-text-sub',
                        )}
                      >
                        {formatDayMonth(d)}
                      </span>
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className="bg-input px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub"
                >
                  {t('col.sumKm')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub"
                >
                  {t('col.note')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub"
                >
                  {t('col.history')}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {skeletonRows}
              {!isLoading &&
                items.map((vehicle) => {
                  const cellByDate = new Map(
                    vehicle.cells.map((c) => [c.date, c]),
                  );
                  const meta = [
                    vehicle.carrier?.name,
                    vehicle.opiekun?.name,
                    vehicle.planner,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <tr
                      key={vehicle.id}
                      className="h-12 hover:bg-brand-50 dark:hover:bg-brand/10"
                    >
                      {/* Identity block — sticky-left */}
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 group-hover:bg-card">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono font-semibold text-text">
                            {vehicle.plateNumber}
                          </span>
                          {vehicle.sideNumber ? (
                            <span className="text-xs text-text-sub">
                              {t('col.sideShort', { side: vehicle.sideNumber })}
                            </span>
                          ) : null}
                        </div>
                        <p
                          className="max-w-[16rem] truncate text-xs text-text-sub"
                          title={meta || undefined}
                        >
                          {meta || '—'}
                        </p>
                      </td>

                      {/* 7 day cells */}
                      {days.map((d) => {
                        const cell = cellByDate.get(d) ?? {
                          date: d,
                          state: null,
                          km: null,
                          notes: null,
                        };
                        const wdIdx = weekdayIndexMonFirst(d);
                        const ariaLabel = t('aria.cell', {
                          plate: vehicle.plateNumber,
                          weekday: tWeekday(WEEKDAY_KEYS[wdIdx]),
                          date: formatDayMonth(d),
                          state:
                            cell.state === 'drove'
                              ? tCell('drove')
                              : cell.state === 'idle'
                                ? tCell('idle')
                                : tCell('empty'),
                        });
                        return (
                          <KmCell
                            key={d}
                            cell={cell}
                            mode={mode}
                            isWeekend={wdIdx >= 5}
                            ariaLabel={ariaLabel}
                            onOpenEditor={
                              mode === 'edit'
                                ? (c) => onOpenEditor?.(vehicle, c)
                                : undefined
                            }
                          />
                        );
                      })}

                      {/* Σ KM */}
                      <td className="bg-input px-3 py-2 text-right">
                        {vehicle.kmSum > 0 ? (
                          <span className="font-mono font-semibold tabular-nums text-text">
                            {vehicle.kmSum.toLocaleString('pl-PL')}
                          </span>
                        ) : (
                          <span className="text-text-sub">0</span>
                        )}
                      </td>

                      {/* Notatka roll-up */}
                      <td className="px-3 py-2 text-center">
                        <RowNotes vehicle={vehicle} />
                      </td>

                      {/* Historia */}
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => onOpenHistory(vehicle)}
                        >
                          <History size={14} aria-hidden="true" />
                          {t('col.history')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
