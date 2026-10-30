'use client';

// `<WeekTile>` — one ISO week in the limits calendar (docs/14 §18.2, §18.3).
//
// The tile only SHOWS; the panel edits (D2). Three value lines in a fixed
// order — km/dzień, sobota, €/km — each in its three-state reading:
//   km/day   NULL → «540 dom.» amber · 0 → «wył.» · n
//   Saturday NULL / 0 → «—»          · n
//   rate     NULL → «0,50 dom.» amber · n (0 is a price, not "off")
// Amber sits ONLY on the defaulted value, never on the tile; the tile is muted
// (`bg-input/40`) ONLY when the week pays nothing. Past weeks are not muted —
// muting is taken by "switched off" (§18.2).
//
// While the multi-week panel has a pending change, selected tiles show
// «was → will be» in the changed lines (§18.6.2).
//
// It is a `gridcell` of the calendar grid (§18.5.3): roving tabindex, the
// keyboard is handled by the calendar, the full reading is in `aria-label`.

import { ArrowRight, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { memo, type KeyboardEvent, type MouseEvent } from 'react';
import type { IsoWeekInfo } from '@magguarantee/shared';

import type { BulkSummaryCell } from '@/lib/limits/bulkPlan';
import {
  describeLimit,
  formatLimitNumber,
  isWeekDisabled,
  type LimitDisplay,
  type WeekLimitField,
} from '@/lib/limits/limitState';
import { formatLongDateRange, formatWeekDate } from '@/lib/format/weekLabel';
import { cn } from '@/lib/utils';

/** The changed fields of a selected week while a bulk edit is pending. */
export type WeekTilePreview = Partial<Record<WeekLimitField, BulkSummaryCell>>;

export interface TileClickModifiers {
  /** Shift — range from the anchor. */
  range: boolean;
  /** Ctrl / ⌘ — add or remove this week. */
  toggle: boolean;
}

export interface WeekTileProps {
  info: IsoWeekInfo;
  /** The ISO year shown — a date outside it carries its year. */
  displayYear: number;
  kmPerDay: number | null;
  kmPerSaturday: number | null;
  ratePerKm: number | null;
  isCurrent: boolean;
  isSelected: boolean;
  /** The one tile in the tab order (roving tabindex). */
  tabbable: boolean;
  /** The week has writes queued or in flight. */
  isPending: boolean;
  /** The week's last write failed. */
  isFailed: boolean;
  preview?: WeekTilePreview;
  onTileClick: (isoWeek: number, modifiers: TileClickModifiers) => void;
  onTileKeyDown: (event: KeyboardEvent<HTMLDivElement>, isoWeek: number) => void;
  onTileFocus: (isoWeek: number) => void;
  registerTile: (isoWeek: number, el: HTMLDivElement | null) => void;
}

const FIELDS: readonly WeekLimitField[] = ['kmPerDay', 'kmPerSaturday', 'ratePerKm'];

function WeekTileImpl({
  info,
  displayYear,
  kmPerDay,
  kmPerSaturday,
  ratePerKm,
  isCurrent,
  isSelected,
  tabbable,
  isPending,
  isFailed,
  preview,
  onTileClick,
  onTileKeyDown,
  onTileFocus,
  registerTile,
}: WeekTileProps) {
  const t = useTranslations('limits');
  const locale = useLocale();
  const values = { kmPerDay, kmPerSaturday, ratePerKm };
  const muted = isWeekDisabled(values);

  const from = formatWeekDate(info.start, locale, displayYear);
  const to = formatWeekDate(info.end, locale, displayYear);
  const range = `${from}–${to}`;

  const displays = {
    kmPerDay: describeLimit('kmPerDay', kmPerDay),
    kmPerSaturday: describeLimit('kmPerSaturday', kmPerSaturday),
    ratePerKm: describeLimit('ratePerKm', ratePerKm),
  } satisfies Record<WeekLimitField, LimitDisplay>;

  // Full spoken reading (§18.9 `tileAria`) — the visual lines are hidden from
  // the accessibility tree so the cell is not read twice.
  const srValue = (field: WeekLimitField, d: LimitDisplay): string => {
    switch (d.kind) {
      case 'default':
        return t('sr.default', {
          value:
            field === 'ratePerKm'
              ? t('sr.rate', { value: formatLimitNumber(field, d.value) })
              : t('sr.km', { value: formatLimitNumber(field, d.value) }),
        });
      case 'off':
        return t('sr.off');
      case 'none':
        return t('sr.saturdayNone');
      default:
        return field === 'ratePerKm'
          ? t('sr.rate', { value: formatLimitNumber(field, d.value) })
          : t('sr.km', { value: formatLimitNumber(field, d.value) });
    }
  };
  const ariaLabel = t('tileAria', {
    week: info.isoWeek,
    range: formatLongDateRange(info.start, info.end, locale),
    kmPerDay: srValue('kmPerDay', displays.kmPerDay),
    saturday: srValue('kmPerSaturday', displays.kmPerSaturday),
    rate: srValue('ratePerKm', displays.ratePerKm),
    current: isCurrent ? 'true' : 'false',
  });

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    onTileClick(info.isoWeek, {
      range: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    });
  };

  return (
    <div
      ref={(el) => registerTile(info.isoWeek, el)}
      role="gridcell"
      tabIndex={tabbable ? 0 : -1}
      aria-selected={isSelected}
      aria-label={ariaLabel}
      data-week={info.isoWeek}
      onClick={handleClick}
      onKeyDown={(event) => onTileKeyDown(event, info.isoWeek)}
      onFocus={() => onTileFocus(info.isoWeek)}
      // Shift+click must not start a text selection across the grid.
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
      className={cn(
        'relative min-w-0 select-none rounded-lg border border-border bg-card px-2.5 py-2 text-left',
        'cursor-pointer transition-colors hover:border-brand/40',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25',
        muted && 'bg-input/40',
        isCurrent && 'border-t-2 border-t-brand pt-[7px]',
        isSelected &&
          'border-brand/60 bg-brand-50/40 ring-2 ring-brand/25 dark:bg-brand/10',
        // The current week keeps its brand top bar while selected.
        isSelected && isCurrent && 'border-t-brand',
        isFailed && 'border-danger hover:border-danger',
      )}
    >
      <div aria-hidden>
        {/* Header: one line when the tile is wide enough, otherwise the range
            drops under the number. The switch is a container query on the
            calendar (`@container/cal`), the SAME threshold the month row
            headers use for their spacer, so the legend stays on the value
            baselines (§18.1). The compact layout (calendar < 36rem, labels
            inside the tile) always uses one line. */}
        <div
          className={cn(
            'flex flex-col',
            '@min-[47rem]/cal:h-5 @min-[47rem]/cal:flex-row @min-[47rem]/cal:items-baseline @min-[47rem]/cal:justify-between @min-[47rem]/cal:gap-1',
            '@max-[36rem]/cal:h-5 @max-[36rem]/cal:flex-row @max-[36rem]/cal:items-baseline @max-[36rem]/cal:justify-between @max-[36rem]/cal:gap-1',
          )}
        >
          <span
            className={cn(
              'h-5 text-sm font-bold leading-5 tabular-nums',
              muted ? 'text-text-sub' : 'text-text',
            )}
          >
            {info.isoWeek}
          </span>
          <span
            title={range}
            className="h-4 min-w-0 truncate text-[11px] leading-4 tabular-nums text-text-sub @min-[47rem]/cal:h-auto @max-[36rem]/cal:h-auto"
          >
            {range}
          </span>
        </div>

        {FIELDS.map((field) => (
          <ValueLine
            key={field}
            field={field}
            display={displays[field]}
            preview={preview?.[field]}
            muted={muted}
          />
        ))}
      </div>

      {isPending && (
        <Loader2
          size={12}
          aria-hidden
          className="absolute right-1.5 top-1.5 animate-spin text-text-sub"
        />
      )}
    </div>
  );
}

export const WeekTile = memo(WeekTileImpl);
export default WeekTile;

// ── One value line ──────────────────────────────────────────────────

function ValueLine({
  field,
  display,
  preview,
  muted,
}: {
  field: WeekLimitField;
  display: LimitDisplay;
  preview?: BulkSummaryCell;
  muted: boolean;
}) {
  const t = useTranslations('limits');
  const label =
    field === 'kmPerDay'
      ? t('legend.kmPerDay')
      : field === 'kmPerSaturday'
        ? t('legend.saturday')
        : t('legend.rate');

  return (
    <div className="flex h-5 items-baseline justify-between gap-2 leading-5">
      {/* Phones: the month row has no legend column, so each line carries
          its own label (§18.10). */}
      <span className="text-[11px] text-text-sub @min-[36rem]/cal:hidden">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-sm tabular-nums">
        {preview?.changed && preview.nextRaw !== undefined ? (
          <>
            <span className="text-text-sub">
              {previewFrom(field, preview.currentRaw, t)}
            </span>
            <ArrowRight
              size={10}
              aria-hidden
              className="mx-0.5 inline-block align-baseline text-text-sub"
            />
            <span className="font-semibold text-text">
              {previewTo(field, preview.nextRaw, t)}
            </span>
          </>
        ) : (
          <DisplayValue field={field} display={display} muted={muted} />
        )}
      </span>
    </div>
  );
}

function DisplayValue({
  field,
  display,
  muted,
}: {
  field: WeekLimitField;
  display: LimitDisplay;
  muted: boolean;
}) {
  const t = useTranslations('limits');
  switch (display.kind) {
    case 'default':
      // State A: amber, only on the value itself (§18.3).
      return (
        <span className="text-warning-dark dark:text-warning">
          {t('valueDefault', { value: formatLimitNumber(field, display.value) })}
        </span>
      );
    case 'off':
      return <span className="text-text-sub">{t('valueOff')}</span>;
    case 'none':
      return <span className="text-text-sub">—</span>;
    default:
      return (
        <span className={muted ? 'text-text-sub' : 'text-text'}>
          {formatLimitNumber(field, display.value)}
        </span>
      );
  }
}

type Translate = ReturnType<typeof useTranslations>;

/** «was» side of the preview: a NULL source reads «dom.» (§18.6.2). */
function previewFrom(
  field: WeekLimitField,
  value: number | null,
  t: Translate,
): string {
  if (field === 'kmPerSaturday') {
    return value == null || value === 0 ? '—' : formatLimitNumber(field, value);
  }
  if (value == null) return t('bulk.valueDefaultShort');
  if (field === 'kmPerDay' && value === 0) return t('valueOff');
  return formatLimitNumber(field, value);
}

/** «will be» side: what the bulk write stores (never NULL). */
function previewTo(field: WeekLimitField, value: number, t: Translate): string {
  if (value === 0 && field === 'kmPerSaturday') return '—';
  if (value === 0 && field === 'kmPerDay') return t('valueOff');
  return formatLimitNumber(field, value);
}
