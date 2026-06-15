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
import { Fragment, useMemo, useState } from 'react';
import {
  isPastBusinessDay,
  type VehicleKmBoardItemDto,
  type VehicleKmCellDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/Popover';
import { KmCell } from '@/components/km/KmCell';
import { carrierAccent } from '@/lib/format/carrier-accent';
import {
  formatDayMonth,
  todayIso,
  weekDays,
  weekdayIndexMonFirst,
} from '@/lib/format/week';
import { cn } from '@/lib/utils';

/** Total column count of the grid (identity + 7 days + Σ + note + history). */
const TOTAL_COLUMNS = 11;

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
  /**
   * §7.8 multi-carrier grouping. Default `false` so §7.7 callers (weryfikator
   * board, plain read-report) are UNTOUCHED. When `true` AND ≥2 distinct
   * carriers are present, rows are sorted into contiguous carrier blocks with
   * a group-header row + a 2px carrier-accent border on the frozen identity
   * cell, and the redundant `przewoźnik` segment is dropped from the row meta
   * line. With ≤1 distinct carrier it collapses to the plain grid (§7.8.3).
   */
  groupByCarrier?: boolean;
}

/** A carrier section computed for grouped (§7.8.1) rendering. */
interface CarrierGroup {
  id: string;
  name: string;
  items: VehicleKmBoardItemDto[];
  kmSum: number;
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
  groupByCarrier = false,
}: KmWeekGridProps) {
  const t = useTranslations('weryfikator.km');
  const tMyKm = useTranslations('myKm');
  const tWeekday = useTranslations('weryfikator.km.weekday');
  const tCell = useTranslations('weryfikator.km.cell');

  const days = weekDays(weekStart);
  const today = todayIso();

  // §7.8.3 single-carrier collapse — grouped rendering only ever activates
  // when ≥2 distinct carriers are present. Decided purely from the data, not
  // from the role: a multi-carrier role with one carrier this week collapses
  // to the plain grid, and a `przewoznik` is just the guaranteed case.
  const distinctCarrierCount = useMemo(
    () =>
      new Set(items.map((v) => v.carrier?.id).filter(Boolean)).size,
    [items],
  );
  const grouped = groupByCarrier && distinctCarrierCount >= 2;

  // §7.8.1a — sort rows by `carrier.name` (locale `pl`, then `plateNumber`)
  // into contiguous carrier blocks with a per-block km roll-up.
  const carrierGroups = useMemo<CarrierGroup[]>(() => {
    if (!grouped) return [];
    const byId = new Map<string, CarrierGroup>();
    for (const v of items) {
      const id = v.carrier?.id ?? '—';
      const name = v.carrier?.name ?? '—';
      let g = byId.get(id);
      if (!g) {
        g = { id, name, items: [], kmSum: 0 };
        byId.set(id, g);
      }
      g.items.push(v);
      g.kmSum += v.kmSum;
    }
    const collator = new Intl.Collator('pl', { sensitivity: 'base' });
    const groups = [...byId.values()].sort((a, b) =>
      collator.compare(a.name, b.name),
    );
    for (const g of groups) {
      g.items.sort((a, b) => collator.compare(a.plateNumber, b.plateNumber));
    }
    return groups;
  }, [grouped, items]);

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

  // One vehicle row — shared by the plain and grouped renderings. In grouped
  // mode (`accent` provided) the frozen identity cell carries a 2px carrier
  // accent border (§7.8.1b) and the meta line drops the `przewoźnik` segment
  // (§7.8.1c).
  const renderVehicleRow = (
    vehicle: VehicleKmBoardItemDto,
    accentBorder: string | null,
  ) => {
    const cellByDate = new Map(vehicle.cells.map((c) => [c.date, c]));
    const meta = [
      // §7.8.1c — drop the carrier name in grouped mode (it is the group header).
      accentBorder ? null : vehicle.carrier?.name,
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
        {/* Identity block — sticky-left (+ carrier accent border in grouped mode) */}
        <td
          className={cn(
            'sticky left-0 z-10 bg-card px-3 py-2 group-hover:bg-card',
            accentBorder && `border-l-2 ${accentBorder}`,
          )}
        >
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
          const stateLabel =
            cell.state === 'drove'
              ? tCell('drove')
              : cell.state === 'idle'
                ? tCell('idle')
                : tCell('empty');
          const ariaLabel = t('aria.cell', {
            plate: vehicle.plateNumber,
            weekday: tWeekday(WEEKDAY_KEYS[wdIdx]),
            date: formatDayMonth(d),
            state: stateLabel,
          });
          // §7.7.1a — lock modifier: edit board only, today + future days
          // (strictly-past days stay editable). `isPastBusinessDay` is the same
          // Europe/Warsaw predicate the server's 422 guard uses, so the lock
          // boundary matches the backend exactly.
          const isLocked = mode === 'edit' && !isPastBusinessDay(d);
          const lockedAriaLabel = isLocked
            ? t('aria.cellLocked', {
                plate: vehicle.plateNumber,
                weekday: tWeekday(WEEKDAY_KEYS[wdIdx]),
                date: formatDayMonth(d),
                state: stateLabel,
              })
            : undefined;
          return (
            <KmCell
              key={d}
              cell={cell}
              mode={mode}
              isWeekend={wdIdx >= 5}
              isLocked={isLocked}
              ariaLabel={ariaLabel}
              lockedAriaLabel={lockedAriaLabel}
              onOpenEditor={
                mode === 'edit' && !isLocked
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
  };

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
              {!isLoading && !grouped
                ? items.map((vehicle) => renderVehicleRow(vehicle, null))
                : null}
              {!isLoading && grouped
                ? carrierGroups.map((group) => {
                    const accent = carrierAccent(group.id);
                    return (
                      <Fragment key={group.id}>
                        {/* §7.8.1a — carrier group section-header row */}
                        <tr
                          className="bg-input"
                          aria-label={tMyKm('aria.carrierGroup', {
                            carrier: group.name,
                            count: group.items.length,
                          })}
                        >
                          <td
                            colSpan={TOTAL_COLUMNS}
                            className="sticky left-0 z-10 h-9 bg-input px-3"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'h-5 w-1 shrink-0 rounded-full',
                                  accent.accentBar,
                                )}
                              />
                              <Truck
                                size={14}
                                className="shrink-0 text-text-sub"
                                aria-hidden="true"
                              />
                              <span className="text-sm font-semibold text-text">
                                {group.name}
                              </span>
                              <span className="ml-auto text-xs tabular-nums text-text-sub">
                                {tMyKm('group.summary', {
                                  count: group.items.length,
                                  sum: group.kmSum.toLocaleString('pl-PL'),
                                })}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {group.items.map((vehicle) =>
                          renderVehicleRow(vehicle, accent.accentBorder),
                        )}
                      </Fragment>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
