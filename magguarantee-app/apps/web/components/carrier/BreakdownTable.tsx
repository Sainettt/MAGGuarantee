'use client';

// Phase 3 — read-only month-by-month km-calc breakdown rendered on the
// new-claim form's preview panel AND inside the (narrow) employee claim-detail
// modal. Per docs/14 § Phase 3 "<BreakdownTable>" + § "Responsive breakdown".
// The shape mirrors `MonthBreakdownDto` from `@magguarantee/shared`.
//
// Responsive strategy (docs/14 § "Responsive breakdown table"):
//   • `< sm` (narrow modal / phone): a STACKED CARD per month. The 5 metrics
//     become label/value rows — no horizontal scroll, no squished columns.
//   • `≥ sm` (wide carrier preview panel, desktop): the classic 5-column
//     <table>, tightened to `text-xs` + `px-2` with `whitespace-nowrap`
//     headers so the abbreviated PL/EN labels never wrap.
// Both views are always rendered; visibility is toggled with `sm:hidden` /
// `hidden sm:block`. The excluded-days disclosure is shared via <ExcludedDays>.
//
// Each month exposes a chevron when the engine surfaced any holiday /
// EU-truck-ban days that were dropped from the count. Expanding reveals the
// explicit date + label so the carrier can see WHY a workday didn't pay out
// (weekends are universal and intentionally not listed).

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

// ── Shared excluded-days disclosure ──────────────────────────────────
// Rendered once per expanded month, identical in both the table and the
// stacked-card layout. `as` lets the table variant wrap it in a colSpan <td>.

interface ExcludedDaysProps {
  excluded: NonNullable<MonthBreakdownDto['excludedDays']>;
  locale: string;
}

function ExcludedDays({ excluded, locale }: ExcludedDaysProps) {
  const t = useTranslations('carrier.breakdown');
  return (
    <>
      <div className="text-xs font-bold uppercase tracking-wider text-text-sub mb-2">
        {t('excludedDays')}
      </div>
      {/* ≤4 entries → single column (faster vertical scan). ≥5 → 2-col at md+
          to keep the panel from doubling in height. Mobile always 1-col. */}
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
    </>
  );
}

// ── Shared month-toggle button (chevron + ym + count) ────────────────

interface MonthToggleProps {
  row: MonthBreakdownDto;
  open: boolean;
  onToggle: () => void;
  excludedCount: number;
}

function MonthToggle({ row, open, onToggle, excludedCount }: MonthToggleProps) {
  const t = useTranslations('carrier.breakdown');
  if (excludedCount === 0) {
    return (
      <span className="font-mono text-text pl-[22px]">{row.yearMonth}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? t('hideDetails') : t('showDetails')}
      title={t('excludedDaysCount', { count: excludedCount })}
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
        ({t('excludedDaysCount', { count: excludedCount })})
      </span>
    </button>
  );
}

// ── Table variant (≥ sm) ─────────────────────────────────────────────

function TableMonthRow({
  row,
  locale,
}: {
  row: MonthBreakdownDto;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  // Legacy claims persisted before `excludedDays` was added may lack the field.
  const excluded = row.excludedDays ?? [];

  return (
    <>
      <tr className="border-b border-border last:border-b-0">
        <td className="px-2 py-2 h-10 align-middle">
          <MonthToggle
            row={row}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            excludedCount={excluded.length}
          />
        </td>
        <td className="px-2 py-2 h-10 text-right tabular-nums text-text align-middle whitespace-nowrap">
          {formatDaysPl(row.workingDays)}
        </td>
        <td className="px-2 py-2 h-10 text-right tabular-nums text-text align-middle whitespace-nowrap">
          {formatInt(row.kmPerDay)}
        </td>
        <td className="px-2 py-2 h-10 text-right tabular-nums text-text align-middle whitespace-nowrap">
          {formatRate(row.ratePerKm)}
        </td>
        <td className="px-2 py-2 h-10 text-right tabular-nums font-semibold text-text align-middle whitespace-nowrap">
          {formatInt(row.kmInMonth)}
        </td>
      </tr>
      {excluded.length > 0 && open && (
        <tr className="border-b border-border last:border-b-0 bg-bg/60">
          <td colSpan={5} className="px-3 py-3">
            <ExcludedDays excluded={excluded} locale={locale} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Stacked-card variant (< sm) ──────────────────────────────────────
// Each month is a bordered card. The 4 metrics render as a 2×2 label/value
// grid; the row total (Km/mc) is emphasised. No horizontal scroll ever.

function CardMonth({
  row,
  locale,
}: {
  row: MonthBreakdownDto;
  locale: string;
}) {
  const t = useTranslations('carrier.breakdown');
  const [open, setOpen] = useState(false);
  const excluded = row.excludedDays ?? [];

  return (
    <li className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <MonthToggle
          row={row}
          open={open}
          onToggle={() => setOpen((v) => !v)}
          excludedCount={excluded.length}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-text-sub">{t('workingDays')}</dt>
          <dd className="tabular-nums text-text">
            {formatDaysPl(row.workingDays)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-text-sub">{t('kmPerDay')}</dt>
          <dd className="tabular-nums text-text">{formatInt(row.kmPerDay)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-text-sub">{t('ratePerKm')}</dt>
          <dd className="tabular-nums text-text">{formatRate(row.ratePerKm)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-text-sub">{t('kmInMonth')}</dt>
          <dd className="tabular-nums font-semibold text-text">
            {formatInt(row.kmInMonth)}
          </dd>
        </div>
      </dl>
      {excluded.length > 0 && open && (
        <div className="mt-3 border-t border-border pt-3">
          <ExcludedDays excluded={excluded} locale={locale} />
        </div>
      )}
    </li>
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
      {/* Stacked cards — narrow modal & phone. No horizontal scroll. */}
      <div className="sm:hidden p-3">
        {rows.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-text-sub">
            {t('empty')}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {rows.map((row) => (
                <CardMonth key={row.yearMonth} row={row} locale={locale} />
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between gap-2 rounded-md bg-bg px-3 py-2.5">
              <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                {t('totalKmGuaranteed')}
              </span>
              <span className="tabular-nums font-extrabold text-text">
                {formatInt(breakdown.kmGuaranteed)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Table — wide preview panel & desktop. */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-bg">
            <tr>
              <th
                scope="col"
                className="px-2 py-2 h-10 text-left text-xs font-bold uppercase tracking-wide text-text-sub border-b border-border whitespace-nowrap"
              >
                {t('month')}
              </th>
              <th
                scope="col"
                className="px-2 py-2 h-10 text-right text-xs font-bold uppercase tracking-wide text-text-sub border-b border-border whitespace-nowrap"
              >
                {t('workingDays')}
              </th>
              <th
                scope="col"
                className="px-2 py-2 h-10 text-right text-xs font-bold uppercase tracking-wide text-text-sub border-b border-border whitespace-nowrap"
              >
                {t('kmPerDay')}
              </th>
              <th
                scope="col"
                className="px-2 py-2 h-10 text-right text-xs font-bold uppercase tracking-wide text-text-sub border-b border-border whitespace-nowrap"
              >
                {t('ratePerKm')}
              </th>
              <th
                scope="col"
                className="px-2 py-2 h-10 text-right text-xs font-bold uppercase tracking-wide text-text-sub border-b border-border whitespace-nowrap"
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
                  className="px-2 py-8 text-center text-sm text-text-sub"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <TableMonthRow key={row.yearMonth} row={row} locale={locale} />
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-bg font-extrabold">
                <td
                  colSpan={4}
                  className="px-2 py-2 h-10 text-text uppercase text-xs tracking-wide whitespace-nowrap"
                >
                  {t('totalKmGuaranteed')}
                </td>
                <td className="px-2 py-2 h-10 text-right tabular-nums text-text whitespace-nowrap">
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
