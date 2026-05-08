'use client';

// Phase 3 — read-only month-by-month km-calc breakdown rendered on the
// new-claim form's preview panel. Per docs/14 § Phase 3 "<BreakdownTable>".
// The shape mirrors `MonthBreakdownDto` from `@magguarantee/shared`.

import { useTranslations } from 'next-intl';
import type { KmCalcBreakdown } from '@magguarantee/shared';

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

export interface BreakdownTableProps {
  breakdown: KmCalcBreakdown;
  className?: string;
}

export function BreakdownTable({ breakdown, className }: BreakdownTableProps) {
  const t = useTranslations('carrier.breakdown');
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
              <tr
                key={row.yearMonth}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-3 py-2 h-10 font-mono text-text align-middle">
                  {row.yearMonth}
                </td>
                <td className="px-3 py-2 h-10 text-right tabular-nums text-text align-middle">
                  {formatInt(row.workingDays)}
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
