'use client';

// Phase 3 — read-only month-by-month km-calc breakdown rendered on the
// new-claim form's preview panel. Per docs/14 § Phase 3 "<BreakdownTable>".
// The shape mirrors `MonthBreakdownDto` from `@magguarantee/shared`.
//
// Each month row exposes a chevron when the engine surfaced any holiday /
// EU-truck-ban days that were dropped from the count. Expanding the row
// reveals the explicit date + label so the carrier can see WHY a workday
// didn't pay out (weekends are universal and intentionally not listed).

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  formatDaysPl,
  type KmCalcBreakdown,
  type MonthBreakdownDto,
} from '@magguarantee/shared';

import { cn } from '@/lib/utils';

function formatInt(n: number): string {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n);
}

function formatRate(n: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n);
}

/** `2026-04-06` → `Pn, 6 kwi 2026` (PL) / `Mon, 6 Apr 2026` (EN). */
function formatExcludedDate(iso: string, locale: string): string {
  // Parse as local midnight — `iso` is always `YYYY-MM-DD` from the engine,
  // never an instant. Building `new Date(y, m-1, d)` avoids UTC drift.
  const parts = iso.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dt);
}

export interface BreakdownTableProps {
  breakdown: KmCalcBreakdown;
  className?: string;
}

interface MonthRowProps {
  row: MonthBreakdownDto;
  locale: string;
}

function MonthRow({ row, locale }: MonthRowProps) {
  const t = useTranslations('carrier.breakdown');
  const [open, setOpen] = useState(false);
  // Legacy claims persisted before `excludedDays` was added to km-calc may have
  // breakdown rows without this field. API does not Zod-parse JSONB on read,
  // so the default([]) in MonthBreakdownSchema doesn't kick in here.
  const excluded = row.excludedDays ?? [];
  const hasExclusions = excluded.length > 0;

  return (
    <>
      <tr className="border-b border-border last:border-b-0">
        <td className="px-3 py-2 h-10 align-middle">
          {hasExclusions ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? t('hideDetails') : t('showDetails')}
              title={t('excludedDaysCount', { count: excluded.length })}
              className="inline-flex items-center gap-1.5 font-mono text-text hover:text-brand transition-colors"
            >
              <ChevronDown
                size={14}
                aria-hidden
                className={cn(
                  'transition-transform shrink-0',
                  open ? 'rotate-0' : '-rotate-90',
                )}
              />
              <span>{row.yearMonth}</span>
              <span className="text-xs font-sans text-text-sub">
                ({t('excludedDaysCount', { count: excluded.length })})
              </span>
            </button>
          ) : (
            <span className="font-mono text-text pl-[22px]">{row.yearMonth}</span>
          )}
        </td>
        <td className="px-3 py-2 h-10 text-right tabular-nums text-text align-middle">
          {/* `workingDays` is the engine's fractional adjusted-working-day count
              (hours / 24, rounded to 2dp). We render it via the shared
              `formatDaysPl` so the carrier always sees the comma decimal
              separator and consistent precision across the app — see
              packages/shared/.../claim-submission-rules.ts. The other columns
              (kmPerDay, kmInMonth, kmGuaranteed) stay integer km values and
              keep `formatInt`. */}
          {formatDaysPl(row.workingDays)}
        </td>
        <td className="px-3 py-2 h-10 text-right tabular-nums text-text align-middle">
          {formatInt(row.kmPerDay)}
        </td>
        <td className="px-3 py-2 h-10 text-right tabular-nums text-text align-middle">
          {formatRate(row.ratePerKm)}
        </td>
        <td className="px-3 py-2 h-10 text-right tabular-nums font-semibold text-text align-middle">
          {formatInt(row.kmInMonth)}
        </td>
      </tr>
      {hasExclusions && open && (
        <tr className="border-b border-border last:border-b-0 bg-bg/60">
          <td colSpan={5} className="px-3 py-3">
            <div className="text-xs font-bold uppercase tracking-wider text-text-sub mb-2">
              {t('excludedDays')}
            </div>
            {/* Phase 3.1 §C — adaptive column count. ≤4 entries always
                renders single-column even at desktop (faster vertical scan,
                no arbitrary column boundary for short lists). ≥5 entries
                keeps the existing 2-column layout at md+ to prevent the
                panel from doubling row height. Mobile stays single-column
                in both branches via `grid-cols-1`. */}
            <ul
              className={cn(
                'grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-text',
                excluded.length >= 5 && 'md:grid-cols-2',
              )}
            >
              {excluded.map((d) => (
                <li
                  key={d.date}
                  className="flex items-baseline justify-between gap-3 border-b border-border/40 last:border-b-0 py-1"
                >
                  <span className="tabular-nums text-text-sub shrink-0">
                    {formatExcludedDate(d.date, locale)}
                  </span>
                  <span className="text-right">{d.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-sub">{t('excludedDaysHint')}</p>
          </td>
        </tr>
      )}
    </>
  );
}

export function BreakdownTable({ breakdown, className }: BreakdownTableProps) {
  const t = useTranslations('carrier.breakdown');
  const locale = useLocale();
  const rows = breakdown.breakdown ?? [];

  return (
    <div
      className={cn(
        'bg-card rounded-lg border border-border overflow-hidden',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg">
            <tr>
              <th
                scope="col"
                className="px-3 py-2 h-10 text-left text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
              >
                {t('month')}
              </th>
              <th
                scope="col"
                className="px-3 py-2 h-10 text-right text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
              >
                {t('workingDays')}
              </th>
              <th
                scope="col"
                className="px-3 py-2 h-10 text-right text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
              >
                {t('kmPerDay')}
              </th>
              <th
                scope="col"
                className="px-3 py-2 h-10 text-right text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
              >
                {t('ratePerKm')}
              </th>
              <th
                scope="col"
                className="px-3 py-2 h-10 text-right text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
              >
                {t('kmInMonth')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-text-sub"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <MonthRow key={row.yearMonth} row={row} locale={locale} />
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-bg font-extrabold">
                <td
                  colSpan={4}
                  className="px-3 py-2 h-10 text-text uppercase text-xs tracking-wider"
                >
                  {t('totalKmGuaranteed')}
                </td>
                <td className="px-3 py-2 h-10 text-right tabular-nums text-text">
                  {formatInt(breakdown.kmGuaranteed)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
