'use client';

// `<WeekEditPanel>` — the editing side of the limits page (docs/14 §18.5,
// §18.6). The calendar tiles only show; this panel edits. Its title tells the
// two modes apart:
//
//   • nothing selected   — empty state «Wybierz tydzień» + «Zaznacz cały rok»;
//   • one week («Tydzień 23 · 01.06–07.06.2026») — `<SingleWeekForm>`,
//     autosave per field;
//   • N > 1 («Zaznaczono 13 tygodni») — `<BulkWeeksForm>`, one explicit
//     atomic «Zastosuj do N tygodni», no autosave.
//
// ≥ 1280 px it is docked next to the calendar (`variant="docked"`, own card
// shell and ✕); below it is rendered inside a <Sheet> (`variant="sheet"`, the
// Sheet supplies the shell and the ✕). The title is the panel's only
// `aria-live` region: a week change is announced by its new title.

import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { IsoWeekInfo, UpdateWeeklyLimitDto, WeeklyLimitDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  formatDateWithYear,
  formatRangeWithYear,
  formatWeekDate,
  parseLocalIsoDate,
} from '@/lib/format/weekLabel';
import type {
  BulkFormValues,
  BulkPayloadResult,
  BulkSummary,
} from '@/lib/limits/bulkPlan';
import {
  compactWeekList,
  isContiguous,
  quarterOfWeek,
  type CalendarYear,
} from '@/lib/limits/calendarGrid';
import { weekValues, type WeekLimitField } from '@/lib/limits/limitState';
import { cn } from '@/lib/utils';

import BulkWeeksForm from './BulkWeeksForm';
import SingleWeekForm, { type PanelFocusRequest } from './SingleWeekForm';

export interface WeekEditPanelBulkProps {
  form: BulkFormValues;
  onFormChange: (next: BulkFormValues) => void;
  payloadResult: BulkPayloadResult;
  summary: BulkSummary;
  applying: boolean;
  onApply: () => void;
}

export interface WeekEditPanelProps {
  variant: 'docked' | 'sheet';
  /** Id of the panel title — the Sheet labels its dialog with it. */
  headingId: string;
  calendar: CalendarYear;
  /** Selected ISO weeks, ascending. Ignored (empty state) until `ready`. */
  selected: readonly number[];
  /** The year's rows are loaded — never edit on top of unknown values. */
  ready: boolean;
  currentWeek: number | null;
  /** Business today (Europe/Warsaw), `YYYY-MM-DD`. */
  todayIso: string;
  rowOf: (isoWeek: number) => WeeklyLimitDto | null;
  isPending: (isoWeek: number) => boolean;
  isFailed: (isoWeek: number) => boolean;
  onSaveWeek: (isoWeek: number, body: UpdateWeeklyLimitDto) => Promise<void>;
  onRetryWeek: (isoWeek: number) => void;
  onNavigate: (delta: -1 | 1, field: WeekLimitField | null) => void;
  onReturnToGrid: () => boolean;
  focusRequest: PanelFocusRequest | null;
  onFocusRequestDone: () => void;
  onClear: () => void;
  onSelectYear: () => void;
  onSelectRange: (from: number, to: number) => void;
  bulk: WeekEditPanelBulkProps;
}

export default function WeekEditPanel({
  variant,
  headingId,
  calendar,
  selected,
  ready,
  currentWeek,
  todayIso,
  rowOf,
  isPending,
  isFailed,
  onSaveWeek,
  onRetryWeek,
  onNavigate,
  onReturnToGrid,
  focusRequest,
  onFocusRequestDone,
  onClear,
  onSelectYear,
  onSelectRange,
  bulk,
}: WeekEditPanelProps) {
  const t = useTranslations('limits');
  const tWeek = useTranslations('common.isoWeek');
  const locale = useLocale();

  const shell = (children: React.ReactNode) =>
    variant === 'docked' ? (
      <section
        aria-labelledby={headingId}
        className="rounded-xl border border-border bg-card p-4 shadow-card"
      >
        {children}
      </section>
    ) : (
      <section aria-labelledby={headingId}>{children}</section>
    );

  // ── Empty state ───────────────────────────────────────────────────
  if (!ready || selected.length === 0) {
    return shell(
      <EmptyState
        className="py-8"
        title={t('panel.emptyTitle')}
        message={t('panel.emptyBody')}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!ready}
            onClick={onSelectYear}
          >
            {t('selection.selectYear')}
          </Button>
        }
      />,
    );
  }

  const monthName = (month: number): string => {
    const name = t(`months.${month}`);
    return locale === 'pl' ? name.toLocaleLowerCase('pl-PL') : name;
  };
  const quarterLabel = (isoWeek: number): string => {
    const q = calendar.quarters[quarterOfWeek(calendar, isoWeek) - 1]!;
    return t('quarter', { q: String(q.quarter), from: q.fromWeek, to: q.toWeek });
  };

  const isSingle = selected.length === 1;
  const first = selected[0]!;
  const last = selected[selected.length - 1]!;
  const firstInfo: IsoWeekInfo = calendar.weeks[first - 1]!;
  const lastInfo: IsoWeekInfo = calendar.weeks[last - 1]!;

  const header = (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-2">
        <h2
          id={headingId}
          aria-live="polite"
          className={cn(
            'font-bold leading-snug text-text',
            variant === 'docked' ? 'text-base' : 'text-lg pr-8',
          )}
        >
          {isSingle
            ? tWeek('fullWithRange', {
                week: first,
                // «01.06–07.06.2026»; W01: «29.12.2025–04.01.2026».
                from: formatWeekDate(
                  firstInfo.start,
                  locale,
                  parseLocalIsoDate(firstInfo.end)?.getFullYear(),
                ),
                to: formatDateWithYear(firstInfo.end, locale),
              })
            : t('selection.title', { count: selected.length })}
        </h2>
        {variant === 'docked' && (
          <button
            type="button"
            aria-label={t('selection.clear')}
            onClick={onClear}
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-sub transition-colors hover:bg-input hover:text-text focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-text-sub">
        {isSingle ? (
          <>
            {monthName(firstInfo.thursdayMonth)} · {quarterLabel(first)}
            {currentWeek === first && (
              <Badge className="ml-1.5 border border-brand/40 px-1.5 py-0 text-[11px]">
                {t('currentBadge')}
              </Badge>
            )}
          </>
        ) : (
          <>
            {t('selection.weeks', { list: compactWeekList(selected) })}
            {/* Dates only for an unbroken run — a scattered list has none. */}
            {isContiguous(selected) &&
              ` · ${formatRangeWithYear(firstInfo.start, lastInfo.end, locale)}`}
          </>
        )}
      </p>
    </div>
  );

  if (isSingle) {
    const isoWeek = first;
    return shell(
      <>
        {header}
        <SingleWeekForm
          // A fresh form per week: drafts and field states never leak between
          // weeks; `focusRequest` restores the caret after Enter.
          key={firstInfo.key}
          info={firstInfo}
          lastWeek={calendar.lastWeek}
          row={rowOf(isoWeek)}
          prevRow={isoWeek > 1 ? rowOf(isoWeek - 1) : null}
          isPast={firstInfo.end < todayIso}
          isPending={isPending(isoWeek)}
          isFailed={isFailed(isoWeek)}
          onSave={(body) => onSaveWeek(isoWeek, body)}
          onRetry={() => onRetryWeek(isoWeek)}
          onNavigate={onNavigate}
          onReturnToGrid={onReturnToGrid}
          focusRequest={focusRequest}
          onFocusRequestDone={onFocusRequestDone}
        />
      </>,
    );
  }

  return shell(
    <>
      {header}
      <BulkWeeksForm
        weeks={selected}
        lastWeek={calendar.lastWeek}
        form={bulk.form}
        onFormChange={bulk.onFormChange}
        firstWeekValues={weekValues(rowOf(first))}
        payloadResult={bulk.payloadResult}
        summary={bulk.summary}
        applying={bulk.applying}
        onApply={bulk.onApply}
        onCancel={onClear}
        onSelectRange={onSelectRange}
        onSelectYear={onSelectYear}
        focusRequest={focusRequest}
        onFocusRequestDone={onFocusRequestDone}
      />
    </>,
  );
}
