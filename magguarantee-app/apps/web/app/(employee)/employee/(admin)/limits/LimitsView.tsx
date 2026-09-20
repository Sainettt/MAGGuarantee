'use client';

// Phase 4.5 — admin `/employee/limits` view.
//
// Year selector header + 12-row table (one per month) of `<LimitsRow>`.
// Save-on-blur via `useUpdateLimit` (optimistic patch + rollback inside the
// hook); we render a toast on error here, leaving the cache plumbing in
// the hook.
//
// Missing months: render an empty `<LimitsRow row={null}>`; on first save the
// backend upserts so the row appears in the next refetch with a real id.
//
// §16 (wyłączane limity) adds three things here: the ONE page-level note that
// explains the 540 km/day fallback for months nobody configured, the
// «Zastosuj do wielu miesięcy» dialog trigger, and the sentence stating that
// the daily and Saturday guarantees are independent. Writes go through
// `useSerializedUpdateLimit` so a checkbox click and the blur it causes can
// never race each other on the same month.

import { CalendarRange, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { UpdateMonthlyLimitDto } from '@magguarantee/shared';

import BulkLimitsDialog from '@/components/limits/BulkLimitsDialog';
import { LimitsRow } from '@/components/limits/LimitsRow';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LockNotice } from '@/components/ui/LockNotice';
import { Skeleton } from '@/components/ui/Skeleton';
import { useLimits, useSerializedUpdateLimit } from '@/lib/hooks/useLimits';
import {
  FALLBACK_KM_PER_DAY,
  FALLBACK_RATE_PER_KM,
  countUnconfiguredMonths,
} from '@/lib/limits/limitState';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

function formatRate(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2020;
const MAX_YEAR = CURRENT_YEAR + 2;

export function LimitsView() {
  const t = useTranslations('limits');
  const tCommon = useTranslations('common');
  const tMonths = useTranslations('limits.months');

  const [year, setYear] = useState(CURRENT_YEAR);
  const limitsQ = useLimits(year);
  const { data, isLoading } = limitsQ;

  const [bulkOpen, setBulkOpen] = useState(false);
  // Writes are serialized per `yearMonth` inside the hook: clicking a
  // checkbox blurs the input next to it, so ONE gesture can fire two writes
  // to the same month and an unordered pair would randomly overwrite the
  // value the admin actually meant (§16.3).
  const { save } = useSerializedUpdateLimit();

  const handleSave = async (
    saveYear: number,
    month: number,
    body: UpdateMonthlyLimitDto,
  ): Promise<void> => {
    try {
      await save(saveYear, month, body);
      toast.success(tCommon('saved'));
    } catch {
      toast.error(t('saveError'));
      // Re-throw so `<LimitsRow>` flips the cell into the `error` state.
      throw new Error('save-failed');
    }
  };

  // Map month → server row (or null when none).
  const rowsByMonth = useMemo(() => {
    const map = new Map<number, NonNullable<typeof data>[number]>();
    for (const r of data ?? []) {
      map.set(r.month, r);
    }
    return map;
  }, [data]);

  const months: { month: number; label: string }[] = Array.from(
    { length: 12 },
    (_, i) => ({
      month: i + 1,
      label: tMonths(String(i + 1)),
    }),
  );

  // Only once the year has actually loaded — an undefined cache would read as
  // "12 months unconfigured" and flash a scary note during every year switch.
  const unconfiguredCount = data ? countUnconfiguredMonths(data) : 0;

  const canPrev = year > MIN_YEAR;
  const canNext = year < MAX_YEAR;

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setYear((y) => Math.max(MIN_YEAR, y - 1))}
            disabled={!canPrev}
            aria-label={t('prevYear')}
          >
            <ChevronLeft size={14} aria-hidden />
          </Button>
          <span className="min-w-[4rem] text-center text-xl font-bold tabular-nums text-text">
            {year}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setYear((y) => Math.min(MAX_YEAR, y + 1))}
            disabled={!canNext}
            aria-label={t('nextYear')}
          >
            <ChevronRight size={14} aria-hidden />
          </Button>
          {/* Secondary on purpose: the page's primary scenario is editing one
              cell; bulk application is the exception (§16.4). */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-1"
            // The dialog plans against the loaded year: opening it before the
            // rows arrive would show "brak (domyślne)" for all 12 months.
            disabled={isLoading || !data}
            onClick={() => setBulkOpen(true)}
          >
            <CalendarRange size={14} aria-hidden />
            {t('bulk.trigger')}
          </Button>
        </div>
      </header>

      {/* ONE page-level note (never twelve row-level ones): state A is the
          dangerous one — nobody configured the month and it silently pays the
          maximum. The row sub-lines only mark it; the explanation lives here. */}
      {unconfiguredCount > 0 && (
        <LockNotice icon={Info} className="mb-3">
          {t('defaultsNotice', {
            count: unconfiguredCount,
            kmPerDay: FALLBACK_KM_PER_DAY,
            rate: formatRate(FALLBACK_RATE_PER_KM),
          })}
        </LockNotice>
      )}

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg">
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
                >
                  {t('columns.month')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
                >
                  {t('columns.kmPerDay')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
                >
                  {t('columns.kmPerSaturday')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
                >
                  {t('columns.ratePerKm')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
                >
                  {t('columns.updatedAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* §8.1 D — keep the static month labels live, skeleton only the
                  value cells (km/day, km/Saturday, rate, updatedAt) until the
                  year's limits hydrate. Preserves the 12-row geometry — no
                  layout jump. */}
              {isLoading &&
                months.map(({ month, label }) => (
                  <tr
                    key={`sk-${month}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-2 h-12 align-middle text-text font-medium">
                      {label}
                    </td>
                    {[0, 1, 2, 3].map((i) => (
                      <td key={i} className="px-3 py-2 h-12 align-middle">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))}
              {/* Load failure: never render the editable rows — empty cells
                  would invite overwriting limits that DO exist server-side. */}
              {!isLoading && limitsQ.isError && !data && (
                <tr>
                  <td colSpan={5} className="px-3 py-0">
                    <ErrorState {...queryErrorProps(limitsQ)} />
                  </td>
                </tr>
              )}
              {!isLoading &&
                !(limitsQ.isError && !data) &&
                months.map(({ month, label }) => (
                  <LimitsRow
                    key={month}
                    year={year}
                    month={month}
                    monthLabel={label}
                    row={rowsByMonth.get(month) ?? null}
                    onSave={handleSave}
                  />
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Spelled out, not merely implied by the layout: un-ticking the month
          never touches the Saturday guarantee and vice versa (§16.2). */}
      <p className="mt-2 text-xs text-text-sub">{t('independenceHint')}</p>

      <BulkLimitsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        year={year}
        rows={data}
        monthLabels={months.map((m) => m.label)}
      />
    </section>
  );
}
