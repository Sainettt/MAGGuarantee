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

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { UpdateMonthlyLimitDto } from '@magguarantee/shared';

import { LimitsRow } from '@/components/limits/LimitsRow';
import { Button } from '@/components/ui/Button';
import { useLimits, useUpdateLimit } from '@/lib/hooks/useLimits';

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2020;
const MAX_YEAR = CURRENT_YEAR + 2;

export function LimitsView() {
  const t = useTranslations('limits');
  const tCommon = useTranslations('common');
  const tMonths = useTranslations('limits.months');

  const [year, setYear] = useState(CURRENT_YEAR);
  const { data, isLoading } = useLimits(year);

  const updateM = useUpdateLimit();

  const handleSave = async (
    saveYear: number,
    month: number,
    body: UpdateMonthlyLimitDto,
  ): Promise<void> => {
    try {
      await updateM.mutateAsync({ year: saveYear, month, body });
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
        </div>
      </header>

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
              {isLoading && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-12 text-center text-sm text-text-sub"
                  >
                    {tCommon('loading')}
                  </td>
                </tr>
              )}
              {!isLoading &&
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
    </section>
  );
}
