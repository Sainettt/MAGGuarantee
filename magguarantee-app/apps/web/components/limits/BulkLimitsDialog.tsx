'use client';

// `<BulkLimitsDialog>` — apply one set of limits to many months of the shown
// year (docs/14 §16.4). A `<FormDialog>` (§13.1), not a `<ConfirmDialog>`:
// it carries a form AND the live per-month summary that IS the confirmation.
//
// WHY <Select> AND NOT A CHECKBOX for the km fields: the bulk operation has
// THREE outcomes per field — enable with a value, disable (0), or leave the
// column alone. A checkbox cannot express the third, and an indeterminate
// tri-state toggled by clicking is a guessing game. The row in the table has
// only two outcomes, so it keeps its checkbox; here the control differs
// deliberately.
//
// The «Obecnie → Po zmianie» table is mandatory: overwriting twelve months
// with one click is irreversible. Its "Obecnie" column NEVER shows an empty
// cell — «brak (domyślne)» and «wyłączone» are printed, because emptiness is
// what hides the 540 km/day fallback in the first place.
//
// The endpoint is atomic (`POST /limits/bulk` runs in one transaction), so
// there is no per-row result and no "retry the failed months" affordance:
// either every month was written or none was.

import { ArrowRight, CalendarRange } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  BulkUpdateMonthlyLimitsSchema,
  type MonthlyLimitDto,
} from '@magguarantee/shared';

import {
  FormDialog,
  FormDialogBody,
  FormDialogDescription,
  FormDialogFooter,
  FormDialogHeader,
  FormDialogTitle,
} from '@/components/forms/FormDialog';
import { FormItem, FormLabel, FormSection } from '@/components/forms/Form';
import { RevealInset } from '@/components/forms/RevealInset';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select } from '@/components/ui/Select';
import { useBulkUpdateLimits } from '@/lib/hooks/useLimits';
import {
  buildBulkPayload,
  buildBulkSummary,
  resolveMonths,
  type BulkCellValue,
  type BulkFieldAction,
  type BulkFormValues,
} from '@/lib/limits/bulkPlan';
import { cn } from '@/lib/utils';

const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const DEFAULTS: BulkFormValues = {
  mode: 'all',
  from: 1,
  to: 12,
  months: [],
  kmPerDayAction: 'none',
  kmPerDayValue: '',
  kmPerSaturdayAction: 'none',
  kmPerSaturdayValue: '',
  ratePerKm: '',
};

export interface BulkLimitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  /** The year's rows as currently cached — drives the "Obecnie" column. */
  rows: readonly MonthlyLimitDto[] | undefined;
  /** Localised month names, index 0 = January. */
  monthLabels: readonly string[];
}

export default function BulkLimitsDialog({
  open,
  onOpenChange,
  year,
  rows,
  monthLabels,
}: BulkLimitsDialogProps) {
  const t = useTranslations('limits.bulk');
  const tLimits = useTranslations('limits');
  const tCommon = useTranslations('common');

  const form = useForm<BulkFormValues>({ defaultValues: DEFAULTS });
  const values = form.watch();
  const [submitted, setSubmitted] = useState(false);
  const bulkM = useBulkUpdateLimits();

  // Re-arm on every open so a cancelled dialog never reopens half-filled.
  useEffect(() => {
    if (open) {
      form.reset(DEFAULTS);
      setSubmitted(false);
    }
  }, [open, form]);

  const rowsByMonth = useMemo(() => {
    const map = new Map<number, MonthlyLimitDto>();
    for (const row of rows ?? []) map.set(row.month, row);
    return map;
  }, [rows]);

  // Cheap enough (12 rows) to recompute on every keystroke — `form.watch()`
  // hands back a fresh object per render anyway, so memoising it would only
  // add a stale-dep hazard.
  const months = resolveMonths(values);
  const payloadResult = buildBulkPayload(values);
  const summary = buildBulkSummary(
    months,
    rowsByMonth,
    payloadResult.ok ? payloadResult.payload : {},
  );

  const noMonths = months.length === 0;
  const noChanges =
    !payloadResult.ok && payloadResult.error === 'noChanges';
  const valueMissing =
    !payloadResult.ok && payloadResult.error === 'valueRequired';

  // Live where it is actionable; `noChanges` only once the user has touched
  // something (an untouched dialog must not greet the user with an error).
  const error = noMonths
    ? t('errorNoMonths')
    : valueMissing
      ? t('errorValueRequired')
      : noChanges && (submitted || form.formState.isDirty)
        ? t('errorNoChanges')
        : null;

  const submitDisabled = noMonths || noChanges || bulkM.isPending;

  const onSubmit = (): void => {
    setSubmitted(true);
    if (noMonths || !payloadResult.ok) return;
    const parsed = BulkUpdateMonthlyLimitsSchema.safeParse({
      year,
      months,
      ...payloadResult.payload,
    });
    if (!parsed.success) return;
    bulkM.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(t('successToast', { count: months.length }));
        onOpenChange(false);
      },
      onError: () => {
        // Atomic endpoint — nothing was written. Keep the dialog open so the
        // same submit can simply be retried.
        toast.error(tLimits('saveError'));
      },
    });
  };

  const monthName = (m: number): string => monthLabels[m - 1] ?? String(m);

  const cellText = (value: BulkCellValue): string => {
    switch (value.kind) {
      case 'none':
        return t('valueNone');
      case 'disabled':
        return t('valueDisabled');
      case 'noChange':
        return t('valueNoChange');
      default:
        return formatNumber(value.value);
    }
  };

  return (
    <FormDialog open={open} onOpenChange={onOpenChange}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <FormDialogHeader>
          <FormDialogTitle>{t('title')}</FormDialogTitle>
          <FormDialogDescription>
            {t('description', { year })}
          </FormDialogDescription>
        </FormDialogHeader>

        <FormDialogBody className="space-y-6">
          {/* ── 1. Zakres ─────────────────────────────────────────── */}
          <FormSection title={t('rangeLegend')}>
            <div
              role="radiogroup"
              aria-label={t('rangeLegend')}
              className="grid gap-2 sm:grid-cols-3"
            >
              {(
                [
                  ['all', t('rangeAll', { year })],
                  ['range', t('rangeFromTo')],
                  ['custom', t('rangeCustom')],
                ] as const
              ).map(([mode, label]) => (
                <label
                  key={mode}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                    'focus-within:ring-[3px] focus-within:ring-brand/25',
                    values.mode === mode
                      ? 'border-brand/60 bg-brand-50/40 font-semibold text-text dark:bg-brand/10'
                      : 'border-border text-text-sub hover:bg-input',
                  )}
                >
                  <input
                    type="radio"
                    value={mode}
                    className="sr-only"
                    checked={values.mode === mode}
                    onChange={() => form.setValue('mode', mode)}
                  />
                  {label}
                </label>
              ))}
            </div>

            {values.mode === 'range' && (
              <RevealInset className="grid gap-3 sm:grid-cols-2">
                <FormItem>
                  <FormLabel htmlFor="bulk-from">{t('from')}</FormLabel>
                  <Select
                    id="bulk-from"
                    value={String(values.from)}
                    onChange={(e) =>
                      form.setValue('from', Number(e.target.value))
                    }
                  >
                    {MONTH_NUMBERS.map((m) => (
                      <option key={m} value={m}>
                        {monthName(m)}
                      </option>
                    ))}
                  </Select>
                </FormItem>
                <FormItem>
                  <FormLabel htmlFor="bulk-to">{t('to')}</FormLabel>
                  <Select
                    id="bulk-to"
                    value={String(values.to)}
                    onChange={(e) => form.setValue('to', Number(e.target.value))}
                  >
                    {MONTH_NUMBERS.map((m) => (
                      <option key={m} value={m}>
                        {monthName(m)}
                      </option>
                    ))}
                  </Select>
                </FormItem>
              </RevealInset>
            )}

            {values.mode === 'custom' && (
              <RevealInset>
                <MultiSelect
                  id="bulk-months"
                  // Calendar order beats alphabetical order for months.
                  sort={false}
                  options={MONTH_NUMBERS.map((m) => ({
                    value: String(m),
                    label: monthName(m),
                  }))}
                  value={values.months.map(String)}
                  onChange={(next) =>
                    form.setValue(
                      'months',
                      next.map(Number),
                      { shouldDirty: true },
                    )
                  }
                  placeholder={t('monthsPlaceholder')}
                  searchPlaceholder={t('monthsSearchPlaceholder')}
                  emptyText={t('monthsEmpty')}
                />
              </RevealInset>
            )}
          </FormSection>

          {/* ── 2. Wartości ───────────────────────────────────────── */}
          <FormSection title={t('valuesLegend')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ActionField
                id="bulk-kmPerDay"
                label={t('kmPerDayAction')}
                action={values.kmPerDayAction}
                onActionChange={(next) =>
                  form.setValue('kmPerDayAction', next, { shouldDirty: true })
                }
                value={values.kmPerDayValue}
                onValueChange={(next) =>
                  form.setValue('kmPerDayValue', next, { shouldDirty: true })
                }
              />
              <ActionField
                id="bulk-kmPerSaturday"
                label={t('kmPerSaturdayAction')}
                action={values.kmPerSaturdayAction}
                onActionChange={(next) =>
                  form.setValue('kmPerSaturdayAction', next, {
                    shouldDirty: true,
                  })
                }
                value={values.kmPerSaturdayValue}
                onValueChange={(next) =>
                  form.setValue('kmPerSaturdayValue', next, {
                    shouldDirty: true,
                  })
                }
              />
              <FormItem>
                <FormLabel htmlFor="bulk-rate">{t('ratePerKm')}</FormLabel>
                <Input
                  id="bulk-rate"
                  inputMode="decimal"
                  className="tabular-nums"
                  placeholder={t('valueNoChange')}
                  value={values.ratePerKm}
                  onChange={(e) =>
                    form.setValue('ratePerKm', e.target.value, {
                      shouldDirty: true,
                    })
                  }
                />
                <p className="text-xs text-text-sub">{t('rateHint')}</p>
              </FormItem>
            </div>
          </FormSection>

          {/* ── 3. Podsumowanie ───────────────────────────────────── */}
          <FormSection title={t('summaryLegend')}>
            <p className="text-sm text-text">
              {t('summaryHeadline', {
                changed: summary.changedCount,
                total: 12,
                year,
              })}
            </p>
            {summary.overwriteCount > 0 && (
              <p className="text-sm text-text-sub">
                {t('summaryOverwrite', { count: summary.overwriteCount })}
              </p>
            )}
            {summary.noopCount > 0 && (
              <p className="text-sm text-text-sub">
                {t('summaryNoop', { count: summary.noopCount })}
              </p>
            )}
            <p className="text-sm text-text-sub">{t('summaryIrreversible')}</p>

            {summary.rows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-bg">
                    <tr>
                      <th
                        scope="col"
                        className="border-b border-border px-2 py-2 text-left font-bold uppercase tracking-wide text-text-sub"
                      >
                        {t('colMonth')}
                      </th>
                      {[
                        tLimits('columns.kmPerDay'),
                        tLimits('columns.kmPerSaturday'),
                        tLimits('columns.ratePerKm'),
                      ].map((label) => (
                        <th
                          key={label}
                          scope="col"
                          colSpan={3}
                          className="border-b border-border px-2 py-2 text-left font-bold uppercase tracking-wide text-text-sub"
                        >
                          <span className="block">{label}</span>
                          <span className="block font-medium normal-case tracking-normal text-text-sub">
                            {t('colCurrent')} → {t('colNew')}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row) => (
                      <tr
                        key={row.month}
                        className={cn(
                          'border-b border-border last:border-b-0',
                          !row.changed && 'text-text-sub',
                        )}
                      >
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {monthName(row.month)}
                        </td>
                        {[row.kmPerDay, row.kmPerSaturday, row.ratePerKm].map(
                          (cell, i) => (
                            <SummaryCells
                              key={i}
                              currentText={cellText(cell.current)}
                              nextText={cellText(cell.next)}
                              changed={cell.changed}
                              arrowLabel={t('arrowSr')}
                            />
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </FormSection>
        </FormDialogBody>

        <FormDialogFooter>
          {error && (
            <p role="alert" className="mr-auto text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {bulkM.isPending ? (
              t('applying')
            ) : (
              <>
                <CalendarRange size={14} aria-hidden />
                {t('apply', { count: months.length })}
              </>
            )}
          </Button>
        </FormDialogFooter>
      </form>
    </FormDialog>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────

function ActionField({
  id,
  label,
  action,
  onActionChange,
  value,
  onValueChange,
}: {
  id: string;
  label: string;
  action: BulkFieldAction;
  onActionChange: (next: BulkFieldAction) => void;
  value: string;
  onValueChange: (next: string) => void;
}) {
  const t = useTranslations('limits.bulk');
  return (
    <FormItem>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <Select
        id={id}
        value={action}
        onChange={(e) => onActionChange(e.target.value as BulkFieldAction)}
      >
        <option value="none">{t('actionNoChange')}</option>
        <option value="set">{t('actionSet')}</option>
        <option value="disable">{t('actionDisable')}</option>
      </Select>
      {action === 'set' && (
        <RevealInset>
          <Input
            id={`${id}-value`}
            inputMode="decimal"
            className="tabular-nums"
            aria-label={label}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
          />
        </RevealInset>
      )}
    </FormItem>
  );
}

function SummaryCells({
  currentText,
  nextText,
  changed,
  arrowLabel,
}: {
  currentText: string;
  nextText: string;
  changed: boolean;
  arrowLabel: string;
}) {
  return (
    <>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-text-sub">
        {currentText}
      </td>
      <td className="px-1 py-1.5 text-center">
        <ArrowRight
          size={12}
          aria-label={arrowLabel}
          className="inline text-text-sub"
        />
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-2 py-1.5 tabular-nums',
          changed ? 'font-semibold text-text' : 'text-text-sub',
        )}
      >
        {nextText}
      </td>
    </>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    maximumFractionDigits: 4,
  }).format(value);
}
