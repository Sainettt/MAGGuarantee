'use client';

// Multi-week mode of `<WeekEditPanel>` (docs/14 §18.6.2) — replaces the old
// `<BulkLimitsDialog>`: the selection in the calendar IS the range, this form
// says what happens to it.
//
//   Od tyg. [10]  do [22]
//   KM / DZIEŃ     [ Bez zmian              ▾ ]
//   KM / SOBOTA    [ Włącz i ustaw wartość  ▾ ]  → [ 300 ]
//   STAWKA € / KM  [            ]   (empty = no change)
//   [Wypełnij wartościami tyg. 10]
//   PODSUMOWANIE … [▸ Tabela zmian (13)]
//   [Anuluj]                     [Zastosuj do 13 tygodni]
//
// No autosave here: nothing is written until the explicit button, in ONE
// atomic `POST /limits/bulk`. The form state is owned by `<LimitsView>` —
// the selected tiles preview «was → will be» from the same plan
// (`lib/limits/bulkPlan`), and the form is dropped when the selection narrows
// to one week.

import { ArrowRight, CalendarRange, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { FormItem, FormLabel, FormSection } from '@/components/forms/Form';
import { RevealInset } from '@/components/forms/RevealInset';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  fillFromWeek,
  isBulkFormTouched,
  type BulkCellValue,
  type BulkFieldAction,
  type BulkFormValues,
  type BulkPayloadResult,
  type BulkSummary,
  type BulkSummaryCell,
} from '@/lib/limits/bulkPlan';
import { parseWeekNumber } from '@/lib/limits/calendarGrid';
import {
  formatLimitNumber,
  type WeekLimitField,
  type WeekLimitValues,
} from '@/lib/limits/limitState';
import { cn } from '@/lib/utils';

import type { PanelFocusRequest } from './SingleWeekForm';

export interface BulkWeeksFormProps {
  /** Selected ISO weeks, ascending, ≥ 2. */
  weeks: readonly number[];
  lastWeek: number;
  form: BulkFormValues;
  onFormChange: (next: BulkFormValues) => void;
  /** Values of the first selected week — the «Wypełnij wartościami» source. */
  firstWeekValues: WeekLimitValues;
  payloadResult: BulkPayloadResult;
  summary: BulkSummary;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
  onSelectRange: (from: number, to: number) => void;
  onSelectYear: () => void;
  focusRequest: PanelFocusRequest | null;
  onFocusRequestDone: () => void;
}

export default function BulkWeeksForm({
  weeks,
  lastWeek,
  form,
  onFormChange,
  firstWeekValues,
  payloadResult,
  summary,
  applying,
  onApply,
  onCancel,
  onSelectRange,
  onSelectYear,
  focusRequest,
  onFocusRequestDone,
}: BulkWeeksFormProps) {
  const t = useTranslations('limits');
  const tCommon = useTranslations('common');
  const tWeek = useTranslations('common.isoWeek');
  const ids = { from: useId(), to: useId(), day: useId(), sat: useId(), rate: useId(), rateHint: useId(), table: useId() };

  const minWeek = weeks[0] ?? 1;
  const maxWeek = weeks[weeks.length - 1] ?? minWeek;
  const firstWeek = minWeek;

  // ── «Od tyg. … do …» — synced with the selection, committed on blur/Enter ─
  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);
  const [fromText, setFromText] = useState(String(minWeek));
  const [toText, setToText] = useState(String(maxWeek));
  useEffect(() => {
    if (document.activeElement !== fromRef.current) setFromText(String(minWeek));
    if (document.activeElement !== toRef.current) setToText(String(maxWeek));
  }, [minWeek, maxWeek]);

  const commitRange = (): void => {
    // Untouched fields must not turn a scattered selection into a range.
    if (fromText === String(minWeek) && toText === String(maxWeek)) return;
    const from = parseWeekNumber(fromText, lastWeek);
    const to = parseWeekNumber(toText, lastWeek);
    if (from === null || to === null) {
      setFromText(String(minWeek));
      setToText(String(maxWeek));
      return;
    }
    // `from > to` — swapped silently inside `onSelectRange` (§18.6.1).
    onSelectRange(from, to);
    setFromText(String(Math.min(from, to)));
    setToText(String(Math.max(from, to)));
  };
  const onRangeKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRange();
    }
  };

  useEffect(() => {
    if (!focusRequest) return;
    fromRef.current?.focus();
    fromRef.current?.select();
    onFocusRequestDone();
    // Only a new request may move the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  // ── Validation & summary ─────────────────────────────────────────
  const touched = isBulkFormTouched(form);
  const valueMissing =
    !payloadResult.ok && payloadResult.error === 'valueRequired';
  const changed = payloadResult.ok ? summary.changedCount : 0;
  const nothingChanges = !valueMissing && changed === 0;
  // Actionable errors only: an untouched form must not greet with an error.
  const error = valueMissing
    ? t('bulk.errorValueRequired')
    : nothingChanges && touched
      ? t('bulk.errorNoChanges')
      : null;
  const canApply = payloadResult.ok && changed > 0 && !applying;

  const [tableOpen, setTableOpen] = useState(false);

  const set = (patch: Partial<BulkFormValues>): void =>
    onFormChange({ ...form, ...patch });

  return (
    <div
      className="space-y-5"
      onKeyDown={(event) => {
        // Esc = drop the selection without writing (§18.6.2).
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {/* ── Zakres ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-2">
          <label htmlFor={ids.from} className="text-sm text-text">
            {t('selection.from')}
          </label>
          <Input
            ref={fromRef}
            id={ids.from}
            inputMode="numeric"
            className="h-9 w-16 tabular-nums"
            value={fromText}
            onChange={(e) => setFromText(e.target.value)}
            onBlur={commitRange}
            onKeyDown={onRangeKeyDown}
          />
          <label htmlFor={ids.to} className="text-sm text-text">
            {t('selection.to')}
          </label>
          <Input
            ref={toRef}
            id={ids.to}
            inputMode="numeric"
            className="h-9 w-16 tabular-nums"
            value={toText}
            onChange={(e) => setToText(e.target.value)}
            onBlur={commitRange}
            onKeyDown={onRangeKeyDown}
          />
        </div>
        {weeks.length < lastWeek && (
          <Button type="button" variant="ghost" size="sm" onClick={onSelectYear}>
            {t('selection.selectYear')}
          </Button>
        )}
      </div>

      {/* ── Wartości ───────────────────────────────────────────── */}
      <FormSection title={t('bulk.valuesLegend')}>
        <ActionField
          id={ids.day}
          label={t('bulk.kmPerDayAction')}
          action={form.kmPerDayAction}
          value={form.kmPerDayValue}
          onActionChange={(kmPerDayAction) => set({ kmPerDayAction })}
          onValueChange={(kmPerDayValue) => set({ kmPerDayValue })}
        />
        <ActionField
          id={ids.sat}
          label={t('bulk.kmPerSaturdayAction')}
          action={form.kmPerSaturdayAction}
          value={form.kmPerSaturdayValue}
          onActionChange={(kmPerSaturdayAction) => set({ kmPerSaturdayAction })}
          onValueChange={(kmPerSaturdayValue) => set({ kmPerSaturdayValue })}
        />
        <FormItem>
          <FormLabel htmlFor={ids.rate}>{t('bulk.ratePerKm')}</FormLabel>
          <Input
            id={ids.rate}
            inputMode="decimal"
            className="h-9 tabular-nums"
            aria-describedby={ids.rateHint}
            placeholder={t('placeholderNoChange')}
            value={form.ratePerKm}
            onChange={(e) => set({ ratePerKm: e.target.value })}
          />
          <p id={ids.rateHint} className="text-xs text-text-sub">
            {t('bulk.rateHint')}
          </p>
        </FormItem>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onFormChange(fillFromWeek(firstWeekValues))}
        >
          {t('bulk.fillFrom', { week: firstWeek })}
        </Button>
      </FormSection>

      {/* ── Podsumowanie — the summary IS the confirmation ─────── */}
      <FormSection title={t('bulk.summaryLegend')} className="space-y-2">
        <p className="text-sm text-text">
          {t('bulk.summaryHeadline', { changed, total: weeks.length })}
        </p>
        {payloadResult.ok && summary.overwriteCount > 0 && (
          <p className="text-sm text-text-sub">
            {t('bulk.summaryOverwrite', { count: summary.overwriteCount })}
          </p>
        )}
        {payloadResult.ok && summary.noopCount > 0 && (
          <p className="text-sm text-text-sub">
            {t('bulk.summaryNoop', { count: summary.noopCount })}
          </p>
        )}
        <p className="text-sm text-text-sub">{t('bulk.summaryIrreversible')}</p>

        <button
          type="button"
          aria-expanded={tableOpen}
          aria-controls={ids.table}
          onClick={() => setTableOpen((open) => !open)}
          className="inline-flex items-center gap-1 rounded text-sm font-semibold text-text hover:text-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25"
        >
          <ChevronDown
            size={14}
            aria-hidden
            className={cn('transition-transform', !tableOpen && '-rotate-90')}
          />
          {t('bulk.changesTable', { count: weeks.length })}
        </button>
        {tableOpen && (
          <ChangesTable id={ids.table} summary={summary} weekLabel={(w) => tWeek('short', { week: w })} />
        )}
      </FormSection>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        {error && (
          <p role="alert" className="mr-auto text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        <Button type="button" disabled={!canApply} onClick={onApply}>
          {applying ? (
            t('bulk.applying')
          ) : (
            <>
              <CalendarRange size={14} aria-hidden />
              {t('bulk.apply', { count: weeks.length })}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────

/** One km field: «Bez zmian» / «Włącz i ustaw wartość» / «Wyłącz (0 km)». */
function ActionField({
  id,
  label,
  action,
  value,
  onActionChange,
  onValueChange,
}: {
  id: string;
  label: string;
  action: BulkFieldAction;
  value: string;
  onActionChange: (next: BulkFieldAction) => void;
  onValueChange: (next: string) => void;
}) {
  const t = useTranslations('limits.bulk');
  return (
    <FormItem>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <Select
        id={id}
        className="h-9"
        value={action}
        onChange={(e) => onActionChange(e.target.value as BulkFieldAction)}
      >
        <option value="none">{t('actionNoChange')}</option>
        <option value="set">{t('actionSet')}</option>
        <option value="disable">{t('actionDisable')}</option>
      </Select>
      {action === 'set' && (
        <RevealInset className="mt-0">
          <Input
            id={`${id}-value`}
            inputMode="decimal"
            className="h-9 tabular-nums"
            aria-label={label}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
          />
        </RevealInset>
      )}
    </FormItem>
  );
}

const FIELDS: readonly WeekLimitField[] = ['kmPerDay', 'kmPerSaturday', 'ratePerKm'];

/**
 * «Tabela zmian» — «Obecnie → Po zmianie» per week. Mandatory for screen
 * readers and long selections; «Obecnie» is never an empty cell.
 */
function ChangesTable({
  id,
  summary,
  weekLabel,
}: {
  id: string;
  summary: BulkSummary;
  weekLabel: (isoWeek: number) => string;
}) {
  const t = useTranslations('limits');

  const cellText = (field: WeekLimitField, value: BulkCellValue): string => {
    switch (value.kind) {
      case 'none':
        return t('bulk.valueNone');
      case 'disabled':
        return t('bulk.valueDisabled');
      case 'noChange':
        return t('bulk.valueNoChange');
      default:
        return formatLimitNumber(field, value.value);
    }
  };

  return (
    <div id={id} className="space-y-1">
      <p className="flex items-center gap-1 text-[11px] text-text-sub">
        {t('bulk.colCurrent')}
        <ArrowRight size={12} aria-hidden />
        <span className="sr-only">{t('bulk.arrowSr')}</span>
        {t('bulk.colNew')}
      </p>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {[
                t('bulk.colWeek'),
                t('columns.kmPerDay'),
                t('columns.kmPerSaturday'),
                t('columns.ratePerKm'),
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-1.5 text-left font-bold text-text-sub"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr
                key={row.isoWeek}
                className={cn(
                  'border-b border-border last:border-b-0',
                  !row.changed && 'text-text-sub',
                )}
              >
                <th
                  scope="row"
                  className="whitespace-nowrap px-2 py-1.5 text-left font-medium"
                >
                  {weekLabel(row.isoWeek)}
                </th>
                {FIELDS.map((field) => (
                  <ChangeCell
                    key={field}
                    cell={row[field]}
                    currentText={cellText(field, row[field].current)}
                    nextText={cellText(field, row[field].next)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChangeCell({
  cell,
  currentText,
  nextText,
}: {
  cell: BulkSummaryCell;
  currentText: string;
  nextText: string;
}) {
  const t = useTranslations('limits.bulk');
  if (!cell.changed) {
    return (
      <td className="px-2 py-1.5 text-text-sub">{t('valueNoChange')}</td>
    );
  }
  return (
    <td className="px-2 py-1.5">
      <span className="tabular-nums text-text-sub">{currentText}</span>
      {/* Icon, not a «→» glyph — a screen reader would read "right arrow"
          dozens of times (§18.6.2). */}
      <ArrowRight size={12} aria-hidden className="mx-0.5 inline-block text-text-sub" />
      <span className="sr-only"> {t('arrowSr')} </span>
      <span className="font-semibold tabular-nums text-text">{nextText}</span>
    </td>
  );
}
