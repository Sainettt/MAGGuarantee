'use client';

// Phase 3 — read-only month-by-month km-calc breakdown rendered on the
// new-claim form's preview panel AND inside the (narrow) employee claim-detail
// modal. Per docs/14 § Phase 3 "<BreakdownTable>" + § "Responsive breakdown".
// The shape mirrors `MonthBreakdownDto` from `@magguarantee/shared`.
//
// Responsive strategy (docs/14 § "Responsive breakdown table") — CONTAINER
// QUERIES, not viewport breakpoints. The breakdown renders inside a narrow
// modal column whose width is unrelated to the viewport, so a viewport
// breakpoint (`sm:`) would pick the wrong layout (the wide table would win on
// any desktop viewport even when the host column is ~270px). The root is a
// `@container`; the card/table toggle is driven by the component's OWN width:
//   • container `< 34rem` (narrow modal column / phone): a STACKED CARD per
//     month. The 4 metrics become label/value rows — no horizontal scroll, no
//     squished columns.
//   • container `≥ 34rem` (wide carrier preview panel, roomy modal): the
//     classic 5-column <table>, tightened to `text-xs` + `px-2` with
//     `whitespace-nowrap` headers so the abbreviated PL/EN labels never wrap.
// Both views are always rendered; visibility is toggled with the container
// variants `@max-[34rem]:block` / `@min-[34rem]:block` (Tailwind v4 has
// container queries in core — no plugin). The excluded-days disclosure is
// shared via <ExcludedDays>.
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
  type BoundaryDayDto,
  type KmCalcBreakdown,
  type MonthBreakdownDto,
} from '@magguarantee/shared';

import { cn } from '@/lib/utils';

function formatInt(n: number): string {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n);
}

function formatRate(n: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

// ── Boundary-day credited fractions (period first / last day) ────────
// A labeled footer strip showing HOW MUCH of the period's first and last
// calendar day was actually credited. `fraction` (0..1, already 2-dp from the
// engine) is rendered with the same `formatDaysPl` used by the `workingDays`
// column, so "0,75 dnia" here lines up with the day-counts above. Rendered
// ONCE at the block root so it appears identically under both the stacked-card
// and the wide-table variant.
//   • single-day period → engine reports the same date+fraction on both
//     boundaries, so we collapse to one line.
//   • fraction 0 → that boundary day wasn't counted (Sunday / EU-ban / a
//     non-qualifying Saturday); shown muted with an explicit "not counted".
//   • both null → legacy claim / empty range → the whole strip is omitted.

interface BoundaryDaysProps {
  firstDay: KmCalcBreakdown['firstDay'];
  lastDay: KmCalcBreakdown['lastDay'];
  locale: string;
}

function BoundaryLine({
  label,
  day,
  locale,
}: {
  label: string;
  day: BoundaryDayDto;
  locale: string;
}) {
  const t = useTranslations('carrier.breakdown');
  const excluded = day.fraction === 0;
  const value = formatDaysPl(day.fraction);
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-text-sub">{label}</span>
      <span className="flex min-w-0 items-baseline justify-end gap-2 text-right">
        <span className="tabular-nums text-text-sub">
          {formatExcludedDate(day.date, locale)}
        </span>
        <span
          className={cn(
            'whitespace-nowrap tabular-nums',
            excluded ? 'text-text-sub' : 'font-semibold text-text',
          )}
        >
          {excluded
            ? t('boundaryExcluded', { value })
            : t('boundaryCounted', { value })}
        </span>
      </span>
    </li>
  );
}

function BoundaryDays({ firstDay, lastDay, locale }: BoundaryDaysProps) {
  const t = useTranslations('carrier.breakdown');
  if (!firstDay && !lastDay) return null;

  const single =
    firstDay != null && lastDay != null && firstDay.date === lastDay.date;

  return (
    <div className="border-t border-border px-3 py-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-text-sub">
        {t('boundaryTitle')}
      </div>
      <ul className="space-y-1.5 text-sm">
        {single ? (
          <BoundaryLine label={t('boundarySingle')} day={firstDay!} locale={locale} />
        ) : (
          <>
            {firstDay && (
              <BoundaryLine label={t('boundaryFirst')} day={firstDay} locale={locale} />
            )}
            {lastDay && (
              <BoundaryLine label={t('boundaryLast')} day={lastDay} locale={locale} />
            )}
          </>
        )}
      </ul>
      <p className="mt-2 text-xs text-text-sub">{t('boundaryHint')}</p>
    </div>
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

// ── Table variant (container ≥ 34rem) ───────────────────────────────

function TableMonthRow({
  row,
  locale,
}: {
  row: MonthBreakdownDto;
  locale: string;
}) {
  const t = useTranslations('carrier.breakdown');
  const [open, setOpen] = useState(false);
  // Legacy claims persisted before `excludedDays` was added may lack the field.
  const excluded = row.excludedDays ?? [];
  // Odd-Saturday guarantee — only surfaced when a qualifying Saturday was
  // actually credited this month. `workingDays` is weekdays-only, so this line
  // explains why `kmInMonth` exceeds `workingDays × kmPerDay`.
  const hasSaturdays = row.saturdaysCounted > 0;

  return (
    <>
      {/* When a Saturday sub-row follows, drop the month row's bottom border so
          the note reads as part of the same month block. */}
      <tr className={hasSaturdays ? '' : 'border-b border-border last:border-b-0'}>
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
      {hasSaturdays && (
        <tr className="border-b border-border last:border-b-0">
          <td colSpan={5} className="px-2 pb-2 pt-0">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 pl-[22px] text-xs text-text-sub">
              <span className="font-semibold uppercase tracking-wide">
                {t('saturdays')}
              </span>
              <span className="tabular-nums">
                {t('saturdaysDetail', {
                  count: String(row.saturdaysCounted),
                  perSaturday: formatInt(row.kmPerSaturday),
                  total: formatInt(row.kmFromSaturdays),
                })}
              </span>
            </div>
          </td>
        </tr>
      )}
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

// ── Stacked-card variant (container < 34rem) ─────────────────────────
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
  const hasSaturdays = row.saturdaysCounted > 0;

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
        {hasSaturdays && (
          <div className="col-span-2 flex items-baseline justify-between gap-2 border-t border-border/60 pt-2">
            <dt className="text-text-sub">{t('saturdays')}</dt>
            <dd className="tabular-nums text-text">
              {t('saturdaysDetail', {
                count: String(row.saturdaysCounted),
                perSaturday: formatInt(row.kmPerSaturday),
                total: formatInt(row.kmFromSaturdays),
              })}
            </dd>
          </div>
        )}
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
        // `@container` establishes the container-query context; the card/table
        // toggle below is keyed on THIS element's width, not the viewport.
        '@container bg-card rounded-lg border border-border overflow-hidden',
        className,
      )}
    >
      {/* Stacked cards — container narrower than 34rem (cramped modal column,
          phone). No horizontal scroll. */}
      <div className="@max-[34rem]:block @min-[34rem]:hidden p-3">
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

      {/* Table — container at least 34rem wide (preview panel, roomy modal). */}
      <div className="@max-[34rem]:hidden @min-[34rem]:block overflow-x-auto">
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

      {/* Boundary-day fractions — one strip below both variants (rendered only
          when there are month rows and the engine surfaced the boundaries). */}
      {rows.length > 0 && (
        <BoundaryDays
          firstDay={breakdown.firstDay}
          lastDay={breakdown.lastDay}
          locale={locale}
        />
      )}
    </div>
  );
}
