'use client';

// Single-week mode of `<WeekEditPanel>` (docs/14 §18.5) — autosave per field.
//
//   KM / DZIEŃ (PN–PT)      [✓] Włączona  [ 540 ]
//   KM / SOBOTA (06.06)     [✓] Włączona  [ 300 ]
//   STAWKA € / KM                         [ 0,50 ]
//   Maks. w tygodniu (bez świąt): 5 × 540 + 300 = 3 000 km
//   [⧉ Kopiuj z tyg. 22]
//   Wszystkie zmiany zapisane · ostatnia 14:32
//   Enter — następny tydzień · Shift+Enter — poprzedni
//   [‹ Tydz. 22]                                [Tydz. 24 ›]
//
// Field mechanics are exactly §16.3 (`useLimitField` → `guaranteeCell`).
// Success is silent; errors toast upstream and show here in the status line
// with «Ponów». Enter saves and moves to the NEXT week, same field (Excel's
// «Enter goes down»); Shift+Enter to the previous; Esc reverts, a second Esc
// goes back to the calendar. The form is keyed by week, so moving remounts it
// and `focusRequest` puts the caret back into the same field.

import { ChevronLeft, ChevronRight, Copy, Info, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  FALLBACK_KM_PER_DAY,
  FALLBACK_RATE_PER_KM,
  isoWeekSaturday,
  type IsoWeekInfo,
  type UpdateWeeklyLimitDto,
  type WeeklyLimitDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { LockNotice } from '@/components/ui/LockNotice';
import { intlLocaleTag, formatWeekDate } from '@/lib/format/weekLabel';
import { useLimitField, type LimitField } from '@/lib/hooks/useLimitField';
import {
  effectiveKmPerDay,
  effectiveKmPerSaturday,
  formatKmValue,
  formatRateValue,
  isWeekDisabled,
  maxWeeklyKm,
  weekValues,
  type WeekLimitField,
} from '@/lib/limits/limitState';
import { cn } from '@/lib/utils';

/** Where the panel puts the focus: a field, its first field, or a ‹ › button. */
export type PanelFocusTarget = WeekLimitField | 'first' | 'prev' | 'next';

export interface PanelFocusRequest {
  target: PanelFocusTarget;
  nonce: number;
}

export interface SingleWeekFormProps {
  info: IsoWeekInfo;
  lastWeek: number;
  row: WeeklyLimitDto | null;
  /** The previous week's row (W01 has none — no «Kopiuj z tyg.» there). */
  prevRow: WeeklyLimitDto | null;
  isPast: boolean;
  isPending: boolean;
  isFailed: boolean;
  /** Persist a partial body. Rejects on failure (the caller has toasted). */
  onSave: (body: UpdateWeeklyLimitDto) => Promise<void>;
  onRetry: () => void;
  /** Move the selection one week; `field` keeps the caret in that field. */
  onNavigate: (delta: -1 | 1, field: WeekLimitField | null) => void;
  /** Second Esc. `true` ⇒ handled (focus went to the tile). */
  onReturnToGrid: () => boolean;
  focusRequest: PanelFocusRequest | null;
  onFocusRequestDone: () => void;
}

export default function SingleWeekForm({
  info,
  lastWeek,
  row,
  prevRow,
  isPast,
  isPending,
  isFailed,
  onSave,
  onRetry,
  onNavigate,
  onReturnToGrid,
  focusRequest,
  onFocusRequestDone,
}: SingleWeekFormProps) {
  const t = useTranslations('limits');
  const tWeek = useTranslations('common.isoWeek');
  const locale = useLocale();
  const values = weekValues(row);
  const reverted = t('unsavedRevertedSr');

  const kmPerDay = useLimitField({
    kind: 'guarantee',
    value: values.kmPerDay,
    onCommit: (v) => onSave({ kmPerDay: v }),
    revertedAnnouncement: reverted,
  });
  const kmPerSaturday = useLimitField({
    kind: 'guarantee',
    value: values.kmPerSaturday,
    nullMeansOff: true,
    onCommit: (v) => onSave({ kmPerSaturday: v }),
    revertedAnnouncement: reverted,
  });
  const ratePerKm = useLimitField({
    kind: 'rate',
    value: values.ratePerKm,
    onCommit: (v) => onSave({ ratePerKm: v }),
    revertedAnnouncement: reverted,
  });
  const fields: Record<WeekLimitField, LimitField> = {
    kmPerDay,
    kmPerSaturday,
    ratePerKm,
  };

  const prevNavRef = useRef<HTMLButtonElement | null>(null);
  const nextNavRef = useRef<HTMLButtonElement | null>(null);

  // Put the caret where Enter / the calendar / the ‹ › buttons asked for it
  // (once per request). The form is remounted per week, so without this the
  // focus would drop to <body> on every move.
  useEffect(() => {
    if (!focusRequest) return;
    const { target } = focusRequest;
    // At a year edge the requested button is gone — keep the focus on the
    // other one rather than dropping it.
    const nav =
      target === 'prev'
        ? (prevNavRef.current ?? nextNavRef.current)
        : target === 'next'
          ? (nextNavRef.current ?? prevNavRef.current)
          : null;
    if (nav) nav.focus();
    else if (target === 'kmPerSaturday' || target === 'ratePerKm') fields[target].focus();
    else fields.kmPerDay.focus();
    onFocusRequestDone();
    // Only a new request may move the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const weekLabel = tWeek('full', { week: info.isoWeek });
  const saturdayIso = isoWeekSaturday(info.isoYear, info.isoWeek) ?? info.end;
  const fieldLabel = (field: WeekLimitField): string =>
    field === 'kmPerDay'
      ? t('legend.kmPerDay')
      : field === 'kmPerSaturday'
        ? t('legend.saturday')
        : t('legend.rate');

  // ── Keyboard: Enter / Shift+Enter / Esc (§18.5.3) ────────────────
  const onFieldKeyDown =
    (name: WeekLimitField) => (event: KeyboardEvent<HTMLInputElement>) => {
      const field = fields[name];
      if (event.key === 'Enter') {
        event.preventDefault();
        if (field.commitForEnter() === 'invalid') return;
        onNavigate(event.shiftKey ? -1 : 1, name);
        return;
      }
      if (event.key === 'Escape') {
        const handled = field.revert() || onReturnToGrid();
        if (handled) {
          event.preventDefault();
          // The <Sheet> (< 1280 px) closes on a document-level Escape
          // listener; a revert must not close it as well.
          event.nativeEvent.stopImmediatePropagation();
        }
      }
    };

  // ── «Maks. w tygodniu» — live, from what is on screen ────────────
  const liveDay = kmPerDay.liveValue() ?? effectiveKmPerDay(values.kmPerDay);
  const liveSaturday =
    kmPerSaturday.liveValue() ?? effectiveKmPerSaturday(values.kmPerSaturday);
  const formula = `5 × ${formatKmValue(liveDay)} + ${formatKmValue(liveSaturday)}`;
  const total = formatKmValue(maxWeeklyKm(liveDay, liveSaturday));

  // ── «Kopiuj z tyg. N» — copies AND saves; NULL is never copied ──
  const copyFromPrevious = async (): Promise<void> => {
    const source = weekValues(prevRow);
    const body: UpdateWeeklyLimitDto = {};
    const skipped: string[] = [];
    for (const field of ['kmPerDay', 'kmPerSaturday', 'ratePerKm'] as const) {
      const value = source[field];
      if (value == null) skipped.push(fieldLabel(field));
      else body[field] = value;
    }
    setCopyNote(
      skipped.length > 0
        ? t('panel.copySkipped', {
            fields: skipped.join(', '),
            week: info.isoWeek - 1,
          })
        : null,
    );
    if (Object.keys(body).length === 0) return;
    setCopying(true);
    try {
      await onSave(body);
    } catch {
      // Toasted upstream; the status line offers «Ponów».
    } finally {
      setCopying(false);
    }
  };

  // ── Status line (§18.5.2) ─────────────────────────────────────────
  const savedAt = row?.updatedAt ? formatSavedAt(row.updatedAt, locale) : null;

  const muted = isWeekDisabled(values);

  return (
    <div className="space-y-4">
      {isPast && (
        <LockNotice icon={Info}>{t('panel.pastWeek')}</LockNotice>
      )}

      <GuaranteeRow
        name="kmPerDay"
        label={t('panel.weekdays')}
        field={kmPerDay}
        toggleLabel={t('toggleDay', { week: weekLabel })}
        placeholder={t('placeholderDefault', { value: formatKmValue(FALLBACK_KM_PER_DAY) })}
        notConfigured={
          values.kmPerDay == null
            ? t('panel.notConfigured', {
                value: `${formatKmValue(FALLBACK_KM_PER_DAY)} ${t('legend.kmPerDay')}`,
              })
            : null
        }
        onKeyDown={onFieldKeyDown('kmPerDay')}
      />

      <GuaranteeRow
        name="kmPerSaturday"
        label={t('panel.saturday', {
          date: formatWeekDate(saturdayIso, locale, info.isoYear),
        })}
        field={kmPerSaturday}
        toggleLabel={t('toggleSaturday', { week: weekLabel })}
        notConfigured={null}
        onKeyDown={onFieldKeyDown('kmPerSaturday')}
      />

      <RateRow
        label={t('columns.ratePerKm')}
        field={ratePerKm}
        placeholder={t('placeholderDefault', {
          value: formatRateValue(FALLBACK_RATE_PER_KM),
        })}
        notConfigured={
          values.ratePerKm == null
            ? t('panel.notConfigured', {
                value: `${formatRateValue(FALLBACK_RATE_PER_KM)} ${t('legend.rate')}`,
              })
            : null
        }
        mutedHint={muted ? t('disabledRateHint') : null}
        onKeyDown={onFieldKeyDown('ratePerKm')}
      />

      <p className="text-xs tabular-nums text-text-sub">
        {t('panel.maxWeekly', { formula, total })}
      </p>

      {info.isoWeek > 1 && (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={copying}
            onClick={() => void copyFromPrevious()}
          >
            <Copy size={14} aria-hidden />
            {t('panel.copyPrev', { week: info.isoWeek - 1 })}
          </Button>
          {copyNote && (
            <p role="status" className="text-xs text-text-sub">
              {copyNote}
            </p>
          )}
        </div>
      )}

      <div role="status" className="min-h-5 text-xs text-text-sub">
        {isPending ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 size={12} aria-hidden className="animate-spin" />
            {t('panel.saving')}
          </span>
        ) : isFailed ? (
          <span className="text-danger">
            {t('panel.failed')}
            <button
              type="button"
              onClick={onRetry}
              className="rounded font-bold underline underline-offset-2 hover:text-danger-dark focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25"
            >
              {t('panel.retry')}
            </button>
          </span>
        ) : savedAt ? (
          t('panel.saved', { time: savedAt })
        ) : null}
      </div>

      <p className="text-[11px] text-text-sub">{t('panel.keysHint')}</p>

      <div className="flex items-center gap-2">
        {info.isoWeek > 1 && (
          <Button
            ref={prevNavRef}
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('panel.prevWeekAria', { week: info.isoWeek - 1 })}
            onClick={() => onNavigate(-1, null)}
          >
            <ChevronLeft size={14} aria-hidden />
            {t('panel.prevWeek', { week: info.isoWeek - 1 })}
          </Button>
        )}
        {info.isoWeek < lastWeek && (
          <Button
            ref={nextNavRef}
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label={t('panel.nextWeekAria', { week: info.isoWeek + 1 })}
            onClick={() => onNavigate(1, null)}
          >
            {t('panel.nextWeek', { week: info.isoWeek + 1 })}
            <ChevronRight size={14} aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

/** «14:32» today, «28.10.2026 14:32» otherwise — the admin's local clock. */
function formatSavedAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const tag = intlLocaleTag(locale);
  const time = new Intl.DateTimeFormat(tag, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  if (sameDay) return time;
  // «28.10.2026 14:32» — two parts, so no locale-specific «, » in between.
  const day = new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  return `${day} ${time}`;
}

// ── Field rows ──────────────────────────────────────────────────────

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-wider text-text-sub';
/** Checkbox column width — the rate input aligns under the km inputs. */
const TOGGLE_COLUMN = 'w-28 shrink-0';

function FieldInput({
  field,
  labelledBy,
  describedBy,
  placeholder,
  onKeyDown,
}: {
  field: LimitField;
  labelledBy: string;
  describedBy?: string;
  placeholder?: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Input
        ref={field.inputRef}
        type="text"
        inputMode="decimal"
        data-panel-field
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={field.invalid || undefined}
        aria-busy={field.status === 'saving' || undefined}
        value={field.editable ? field.text : '0'}
        // Read-only (not disabled) while saving: a disabled input drops the
        // focus, and Enter on the last week of the year keeps it here.
        readOnly={!field.editable || field.status === 'saving'}
        placeholder={field.editable ? placeholder : undefined}
        onChange={(e) => field.setText(e.target.value)}
        onBlur={field.onBlur}
        onFocus={field.onFocus}
        onKeyDown={onKeyDown}
        className={cn(
          'h-9 tabular-nums transition-colors',
          !field.editable && 'cursor-not-allowed bg-input/40 text-text-sub',
          field.unsaved && 'border-warning bg-warning/5 focus:border-warning',
          (field.status === 'error' || field.invalid) &&
            'border-danger focus:border-danger',
          field.status === 'success' && 'border-success focus:border-success',
        )}
      />
      {field.status === 'saving' && (
        <Loader2
          aria-hidden
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-text-sub"
        />
      )}
    </div>
  );
}

function GuaranteeRow({
  name,
  label,
  field,
  toggleLabel,
  placeholder,
  notConfigured,
  onKeyDown,
}: {
  name: WeekLimitField;
  label: string;
  field: LimitField;
  toggleLabel: string;
  placeholder?: string;
  notConfigured: string | null;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations('limits');
  const labelId = useId();
  const hintId = useId();

  // §16.3: with a remembered value the short line is enough; from a cold page
  // the admin needs the full instruction. NULL gets its amber explanation.
  const hint = field.unsaved
    ? field.hasRemembered
      ? t('unsaved')
      : t('unsavedHint')
    : field.checked && !field.text
      ? notConfigured
      : null;

  return (
    <div data-field={name}>
      <p id={labelId} className={LABEL_CLASS}>
        {label}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {/* Visible «Włączona» — inside the panel there is no row selection
            to confuse it with (§18.5.1). Hit area ≥ 36 px tall. */}
        <label
          className={cn(
            TOGGLE_COLUMN,
            'inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-1.5 text-sm text-text hover:bg-input',
          )}
          onPointerDown={field.onTogglePointerDown}
        >
          <Checkbox
            ref={field.checkboxRef}
            className="h-4 w-4"
            checked={field.checked}
            aria-label={toggleLabel}
            aria-busy={field.status === 'saving' || undefined}
            onChange={(e) => field.onToggle(e.target.checked)}
          />
          <span aria-hidden>{t('panel.enabled')}</span>
        </label>
        <FieldInput
          field={field}
          labelledBy={labelId}
          describedBy={hint ? hintId : undefined}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
        />
      </div>
      {hint && (
        <p
          id={hintId}
          className="mt-1 text-[11px] text-warning-dark dark:text-warning"
        >
          {hint}
        </p>
      )}
      <span role="status" className="sr-only">
        {field.announcement}
      </span>
    </div>
  );
}

function RateRow({
  label,
  field,
  placeholder,
  notConfigured,
  mutedHint,
  onKeyDown,
}: {
  label: string;
  field: LimitField;
  placeholder: string;
  notConfigured: string | null;
  mutedHint: string | null;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const labelId = useId();
  const hintId = useId();
  const amber = !field.text ? notConfigured : null;
  const hint = amber ?? mutedHint;

  return (
    <div data-field="ratePerKm">
      <p id={labelId} className={LABEL_CLASS}>
        {label}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {/* The rate cannot be switched off (a price, §16.1): no checkbox,
            the input lines up under the km inputs. */}
        <span aria-hidden className={TOGGLE_COLUMN} />
        <FieldInput
          field={field}
          labelledBy={labelId}
          describedBy={hint ? hintId : undefined}
          placeholder={placeholder}
          onKeyDown={onKeyDown}
        />
      </div>
      {hint && (
        <p
          id={hintId}
          className={cn(
            'mt-1 text-[11px]',
            amber ? 'text-warning-dark dark:text-warning' : 'text-text-sub',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
