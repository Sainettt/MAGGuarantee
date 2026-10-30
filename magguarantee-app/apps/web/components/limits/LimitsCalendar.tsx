'use client';

// `<LimitsCalendar>` — the ISO-week year as 12 month rows × week tiles in four
// quarter bands (docs/14 §18.1). A week stands in the row of its THURSDAY's
// month; month and quarter week ranges come from `buildCalendarYear`
// (`isoWeeksOfYear`), never hard-coded.
//
// ARIA (§18.5.3): each quarter band is a `<section>` with an `<h3>` heading
// and its own `role="grid" aria-multiselectable` — the quarter headings stay
// OUTSIDE the grids (a heading is not a valid child of a grid), rows = months
// with a `rowheader` (the month-name button), tiles = `gridcell`s with
// `aria-selected`. One tile in the whole calendar is in the tab order (roving
// tabindex); arrows cross the quarter borders. The keyboard and the selection
// live in `<LimitsView>`; this component only lays the grid out.
//
// The legend (`km/dzień · sobota · €/km`) is printed ONCE per month row, on
// the same `h-5` baselines as the tile values — a table of tables (§18.1).

import { useLocale, useTranslations } from 'next-intl';
import type { KeyboardEvent, ReactNode } from 'react';
import type { WeeklyLimitDto } from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { CalendarYear } from '@/lib/limits/calendarGrid';
import { cn } from '@/lib/utils';

import WeekTile, { type TileClickModifiers, type WeekTilePreview } from './WeekTile';

export interface LimitsCalendarProps {
  calendar: CalendarYear;
  rowsByWeek: ReadonlyMap<number, WeeklyLimitDto>;
  /** `loading` — skeleton tiles; `error` — `errorSlot` instead of the grids. */
  status: 'loading' | 'error' | 'ready';
  errorSlot?: ReactNode;
  selected: ReadonlySet<number>;
  /** The week that carries `tabIndex=0`. */
  tabbableWeek: number;
  /** Current ISO week when the shown year is the current one. */
  currentWeek: number | null;
  isPending: (isoWeek: number) => boolean;
  isFailed: (isoWeek: number) => boolean;
  previews: ReadonlyMap<number, WeekTilePreview> | null;
  onTileClick: (isoWeek: number, modifiers: TileClickModifiers) => void;
  onTileKeyDown: (event: KeyboardEvent<HTMLDivElement>, isoWeek: number) => void;
  onTileFocus: (isoWeek: number) => void;
  registerTile: (isoWeek: number, el: HTMLDivElement | null) => void;
  onSelectMonth: (month: number) => void;
  onSelectQuarter: (quarter: number) => void;
}

/** Five week slots per month row (4- or 5-Thursday months). */
const SLOTS = [0, 1, 2, 3, 4] as const;

export default function LimitsCalendar({
  calendar,
  rowsByWeek,
  status,
  errorSlot,
  selected,
  tabbableWeek,
  currentWeek,
  isPending,
  isFailed,
  previews,
  onTileClick,
  onTileKeyDown,
  onTileFocus,
  registerTile,
  onSelectMonth,
  onSelectQuarter,
}: LimitsCalendarProps) {
  const t = useTranslations('limits');
  const locale = useLocale();

  if (status === 'error') {
    return (
      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        {errorSlot}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="@container/cal">
        {calendar.quarters.map((quarter, qi) => {
          const quarterLabel = t('quarter', {
            q: String(quarter.quarter),
            from: quarter.fromWeek,
            to: quarter.toWeek,
          });
          const headingId = `limits-q${quarter.quarter}-heading`;
          return (
            <section
              key={quarter.quarter}
              aria-labelledby={headingId}
              className={cn(qi > 0 && 'mt-3 border-t border-border pt-3')}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3
                  id={headingId}
                  className="text-xs font-bold uppercase tracking-wider text-text-sub"
                >
                  {quarterLabel}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={status !== 'ready'}
                  aria-label={t('selection.selectQuarterAria', {
                    quarter: quarterLabel,
                  })}
                  onClick={() => onSelectQuarter(quarter.quarter)}
                >
                  {t('selection.selectQuarter')}
                </Button>
              </div>

              <div
                role="grid"
                aria-multiselectable="true"
                aria-labelledby={headingId}
                className="space-y-2"
              >
                {quarter.months.map((month) => {
                  const monthName = t(`months.${month.month}`);
                  return (
                    <div
                      key={month.month}
                      role="row"
                      className="grid grid-cols-2 gap-2 @min-[28rem]/cal:grid-cols-3 @min-[36rem]/cal:grid-cols-[7rem_repeat(5,minmax(0,1fr))]"
                    >
                      <div
                        role="rowheader"
                        className="col-span-full @min-[36rem]/cal:col-span-1 @min-[36rem]/cal:border @min-[36rem]/cal:border-transparent @min-[36rem]/cal:py-2"
                      >
                        <button
                          type="button"
                          disabled={status !== 'ready'}
                          aria-label={t('selection.selectMonthAria', {
                            month: locale === 'pl' ? monthName.toLocaleLowerCase('pl-PL') : monthName,
                          })}
                          onClick={() => onSelectMonth(month.month)}
                          className={cn(
                            'block h-5 max-w-full truncate rounded text-left text-sm font-bold uppercase leading-5 text-text',
                            'hover:text-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25',
                            'disabled:cursor-default disabled:hover:text-text',
                          )}
                        >
                          {monthName}
                        </button>
                        {/* Row layout only: the spacer matches the second
                            header line the tiles get between 36 and 47rem,
                            then the legend on the value baselines. */}
                        <div aria-hidden className="hidden @min-[36rem]/cal:block">
                          <div className="h-4 @min-[47rem]/cal:hidden" />
                          <div className="h-5 truncate text-[11px] leading-5 text-text-sub">
                            {t('legend.kmPerDay')}
                          </div>
                          <div className="h-5 truncate text-[11px] leading-5 text-text-sub">
                            {t('legend.saturday')}
                          </div>
                          <div className="h-5 truncate text-[11px] leading-5 text-text-sub">
                            {t('legend.rate')}
                          </div>
                        </div>
                      </div>

                      {status === 'loading'
                        ? month.weeks.map((week) => (
                            <Skeleton
                              key={week}
                              role="gridcell"
                              aria-busy
                              className="h-[6.125rem] rounded-lg @min-[36rem]/cal:h-[7.125rem] @min-[47rem]/cal:h-[6.125rem]"
                            />
                          ))
                        : month.weeks.map((week) => {
                            const info = calendar.weeks[week - 1]!;
                            const row = rowsByWeek.get(week);
                            return (
                              <WeekTile
                                key={week}
                                info={info}
                                displayYear={calendar.isoYear}
                                kmPerDay={row?.kmPerDay ?? null}
                                kmPerSaturday={row?.kmPerSaturday ?? null}
                                ratePerKm={row?.ratePerKm ?? null}
                                isCurrent={currentWeek === week}
                                isSelected={selected.has(week)}
                                tabbable={tabbableWeek === week}
                                isPending={isPending(week)}
                                isFailed={isFailed(week)}
                                preview={previews?.get(week)}
                                onTileClick={onTileClick}
                                onTileKeyDown={onTileKeyDown}
                                onTileFocus={onTileFocus}
                                registerTile={registerTile}
                              />
                            );
                          })}
                      {/* A 4-week month keeps its fifth slot empty — tiles do
                          not stretch, so the month columns read vertically. */}
                      {SLOTS.slice(month.weeks.length).map((slot) => (
                        <div key={`empty-${slot}`} aria-hidden className="hidden @min-[36rem]/cal:block" />
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
