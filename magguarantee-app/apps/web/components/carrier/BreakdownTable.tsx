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
// SWITCHED-OFF MONTHS (docs/14 §16.5) — a month whose guarantee is off pays
// nothing, and a table of zeroes with no explanation reads as a bug. Derived
// from the fields the breakdown already carries (see
// `lib/claims/breakdownGuarantee.ts`): a fully-off month is muted and badged
// «Gwarancja wyłączona», a Saturdays-only month is badged but NOT muted (it
// pays), and wherever nothing is guaranteed the €/km cell prints «—» instead
// of the engine's 0,50 fallback — a price per kilometre is meaningless with
// zero kilometres and reads as a promise. A period that is off end-to-end
// renders an <EmptyState> instead of a table of zeroes.
//
// MIXED PERIOD (docs/14 §16.5.1/§16.5.3/§16.5.5, docs/20 §0⁵) — ONLY when the
// server says so (`breakdown.mileageSource === 'board'`, never re-derived from
// the rows): the payout is settled on the weryfikator's daily-km board, so the
// neutral <GuaranteeGapNotice> goes ABOVE the numbers (the numbers are what
// look broken). Two audiences, decided by data, not by role:
//   • carrier (no `boardSettlement` prop) — one notice, no km/day figures, and
//     `mileageEffective` is shown nowhere;
//   • staff (`boardSettlement` passed by ClaimModal) — the staff notice plus two
//     board columns right of «Km/mc» («Km wg weryfikatora», «Wpisane dni»), a
//     «Razem» footer pairing guaranteed km with the live board total (the sum
//     of the column above it), and a 40rem (not 34rem) table/card threshold because the table is now
//     7 columns wide.
//
// Each month exposes a chevron when the engine surfaced any holiday /
// EU-truck-ban days that were dropped from the count. Expanding reveals the
// explicit date + label so the carrier can see WHY a workday didn't pay out
// (weekends are universal and intentionally not listed).

import { useState } from 'react';
import { AlertTriangle, CalendarOff, ChevronDown, Info } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  formatDaysPl,
  type BoundaryDayDto,
  type ClaimBoardSettlement,
  type KmCalcBreakdown,
  type MonthBreakdownDto,
} from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LockNotice } from '@/components/ui/LockNotice';
import {
  analyzeBreakdown,
  boardCell,
  boardColumnTotalKm,
  boardMonthIndex,
  isMonthGuaranteeDisabled,
  isMonthSaturdayOnly,
  type BoardCell,
  type BoardValueCell,
} from '@/lib/claims/breakdownGuarantee';
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
  /**
   * STAFF ONLY — the live board settlement computed for THIS `breakdown` (same
   * response / same period; never a board from one request next to a
   * breakdown from another — after a period edit the months would not line
   * up). Passed only by ClaimModal; the carrier pages never pass it and the
   * API never sends it to a carrier. The component does not check the role:
   * the staff variant is chosen by the data (§16.5.1). Ignored unless
   * `breakdown.mileageSource === 'board'`, so an all-active period looks
   * exactly as before even if a board is passed in.
   */
  boardSettlement?: ClaimBoardSettlement | null;
  className?: string;
}

/** The «Gwarancja wyłączona» / «tylko w soboty» chip — outline, never loud. */
function GuaranteeBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="muted"
      className="border border-border bg-transparent text-[11px] font-semibold text-text-sub"
    >
      {label}
    </Badge>
  );
}

// ── Mixed-period notice (composition, not a primitive) ──────────────
// Rendered ABOVE the table: the zero rows are what look broken, so the
// explanation has to be read BEFORE the figures. Deliberately neutral (not a
// warning): nothing went wrong, this IS the configuration. Missing board days
// are a separate, amber notice in ClaimModal (staff only) — never mixed in here.
// No km or day figures in either text (§16.5.3): the only parameter is the
// number of months without a (weekday) guarantee.

function GuaranteeGapNotice({
  audience,
  count,
}: {
  audience: 'carrier' | 'staff';
  count: number;
}) {
  const t = useTranslations('carrier.breakdown');
  return (
    <div className="border-b border-border p-3">
      <LockNotice icon={Info}>
        {t.rich(audience === 'staff' ? 'boardNotice' : 'mixedPeriodNotice', {
          count,
          b: (chunks) => (
            <strong className="font-semibold text-text">{chunks}</strong>
          ),
        })}
      </LockNotice>
    </div>
  );
}

// ── Staff board cells (§16.5.5) ─────────────────────────────────────
// «Wpisane dni» value: «14 z 14» / «2 z 2 sob.». An incomplete month is amber
// + <AlertTriangle> + an sr-only «brak danych za N dni» — colour is never the
// only signal (WCAG 1.4.1).

function BoardDaysValue({ cell }: { cell: BoardValueCell }) {
  const t = useTranslations('carrier.breakdown');
  const label = t(cell.saturdaysOnly ? 'boardSaturdaysValue' : 'boardDaysValue', {
    filled: cell.daysFilled,
    required: cell.daysRequired,
  });
  if (cell.missing === 0) {
    return <span className="tabular-nums text-text">{label}</span>;
  }
  return (
    <span className="inline-flex items-center justify-end gap-1 font-semibold text-warning-dark dark:text-warning">
      <AlertTriangle size={12} aria-hidden className="shrink-0" />
      <span className="tabular-nums">{label}</span>
      <span className="sr-only">
        , {t('boardDaysMissingSr', { count: cell.missing })}
      </span>
    </span>
  );
}

/** The two board `<td>`s of one table row. `border-l` = «gwarancja | tablica». */
function BoardTableCells({ cell }: { cell: BoardCell }) {
  const t = useTranslations('carrier.breakdown');
  const base =
    'px-2 py-2 h-10 text-right tabular-nums align-middle whitespace-nowrap';
  if (cell.kind !== 'value') {
    // A number that takes no part in the settlement is not printed (same rule
    // as the ghost rate, §16.5.2).
    return (
      <>
        <td
          className={cn(base, 'border-l border-border text-text-sub')}
          title={cell.kind === 'off' ? t('boardOffTitle') : undefined}
        >
          —
        </td>
        <td className={cn(base, 'text-text-sub')}>—</td>
      </>
    );
  }
  return (
    <>
      <td className={cn(base, 'border-l border-border font-semibold text-text')}>
        {formatInt(cell.km)}
      </td>
      <td className={base}>
        <BoardDaysValue cell={cell} />
      </td>
    </>
  );
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
  board,
}: {
  row: MonthBreakdownDto;
  locale: string;
  /** Staff board cells for this month; `null` ⇒ no board columns at all. */
  board: BoardCell | null;
}) {
  const t = useTranslations('carrier.breakdown');
  const [open, setOpen] = useState(false);
  // Legacy claims persisted before `excludedDays` was added may lack the field.
  const excluded = row.excludedDays ?? [];
  // Odd-Saturday guarantee — only surfaced when a qualifying Saturday was
  // actually credited this month. `workingDays` is weekdays-only, so this line
  // explains why `kmInMonth` exceeds `workingDays × kmPerDay`.
  const hasSaturdays = row.saturdaysCounted > 0;
  const disabled = isMonthGuaranteeDisabled(row);
  const saturdayOnly = isMonthSaturdayOnly(row);
  // Full-width sub-rows span the board columns too when they are present.
  const span = board ? 7 : 5;

  return (
    <>
      {/* When a Saturday sub-row follows, drop the month row's bottom border so
          the note reads as part of the same month block. */}
      <tr
        className={cn(
          hasSaturdays ? '' : 'border-b border-border last:border-b-0',
          // The ONE muted row state: guarantee off. Saturdays-only months stay
          // normal — they pay.
          disabled && 'bg-input/40',
        )}
      >
        <td className="px-2 py-2 h-10 align-middle">
          <div className="flex flex-wrap items-center gap-1.5">
            <MonthToggle
              row={row}
              open={open}
              onToggle={() => setOpen((v) => !v)}
              excludedCount={excluded.length}
            />
            {disabled && <GuaranteeBadge label={t('guaranteeDisabled')} />}
            {saturdayOnly && (
              <GuaranteeBadge label={t('guaranteeSaturdayOnly')} />
            )}
          </div>
        </td>
        <td className="px-2 py-2 h-10 text-right tabular-nums text-text align-middle whitespace-nowrap">
          {formatDaysPl(row.workingDays)}
        </td>
        <td
          className={cn(
            'px-2 py-2 h-10 text-right tabular-nums align-middle whitespace-nowrap',
            disabled ? 'text-text-sub' : 'text-text',
          )}
        >
          {formatInt(row.kmPerDay)}
        </td>
        <td
          className={cn(
            'px-2 py-2 h-10 text-right tabular-nums align-middle whitespace-nowrap',
            disabled ? 'text-text-sub' : 'text-text',
          )}
          title={disabled ? t('rateNoneTitle') : undefined}
        >
          {/* Ghost rate: with zero guaranteed km the engine still reports the
              global 0,50 €/km fallback. Printing it next to «0 km» looks like
              a promise, so it is «—» everywhere (§16.5.2, locked). */}
          {disabled ? '—' : formatRate(row.ratePerKm)}
        </td>
        <td
          className={cn(
            'px-2 py-2 h-10 text-right tabular-nums align-middle whitespace-nowrap',
            disabled ? 'text-text-sub' : 'font-semibold text-text',
          )}
        >
          {formatInt(row.kmInMonth)}
        </td>
        {board && <BoardTableCells cell={board} />}
      </tr>
      {hasSaturdays && (
        <tr className="border-b border-border last:border-b-0">
          <td colSpan={span} className="px-2 pb-2 pt-0">
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
          <td colSpan={span} className="px-3 py-3">
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
  board,
}: {
  row: MonthBreakdownDto;
  locale: string;
  /** Staff board block for this month; `null` ⇒ no board rows at all. */
  board: BoardCell | null;
}) {
  const t = useTranslations('carrier.breakdown');
  const [open, setOpen] = useState(false);
  const excluded = row.excludedDays ?? [];
  const hasSaturdays = row.saturdaysCounted > 0;
  const disabled = isMonthGuaranteeDisabled(row);
  const saturdayOnly = isMonthSaturdayOnly(row);

  return (
    <li
      className={cn(
        'rounded-md border border-border p-3',
        disabled && 'bg-input/40',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <MonthToggle
          row={row}
          open={open}
          onToggle={() => setOpen((v) => !v)}
          excludedCount={excluded.length}
        />
        {disabled && <GuaranteeBadge label={t('guaranteeDisabled')} />}
        {saturdayOnly && <GuaranteeBadge label={t('guaranteeSaturdayOnly')} />}
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
          <dd
            className={cn(
              'tabular-nums',
              disabled ? 'text-text-sub' : 'text-text',
            )}
          >
            {formatInt(row.kmPerDay)}
          </dd>
        </div>
        {/* In the narrow card the ghost-rate row is dropped entirely — a
            column can only be blanked to «—», a card row can go away. */}
        {!disabled && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-text-sub">{t('ratePerKm')}</dt>
            <dd className="tabular-nums text-text">
              {formatRate(row.ratePerKm)}
            </dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-text-sub">{t('kmInMonth')}</dt>
          <dd
            className={cn(
              'tabular-nums',
              disabled ? 'text-text-sub' : 'font-semibold text-text',
            )}
          >
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
        {/* Staff board block (§16.5.5) — after «Soboty», full-width rows
            («Km wg weryfikatora» does not fit half a card). An `off` month has
            no block at all: a card row can go away, a table cell cannot. */}
        {board && board.kind !== 'off' && (
          <>
            <div className="col-span-2 flex items-baseline justify-between gap-2 border-t border-border/60 pt-2">
              <dt className="text-text-sub">{t('boardKm')}</dt>
              <dd
                className={cn(
                  'tabular-nums',
                  board.kind === 'value'
                    ? 'font-semibold text-text'
                    : 'text-text-sub',
                )}
              >
                {board.kind === 'value' ? formatInt(board.km) : '—'}
              </dd>
            </div>
            <div className="col-span-2 flex items-baseline justify-between gap-2">
              <dt className="text-text-sub">{t('boardDays')}</dt>
              <dd className="tabular-nums text-text-sub">
                {board.kind === 'value' ? (
                  <BoardDaysValue cell={board} />
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </>
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

function formatOptionalInt(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? formatInt(n) : '—';
}

export function BreakdownTable({
  breakdown,
  boardSettlement,
  className,
}: BreakdownTableProps) {
  const t = useTranslations('carrier.breakdown');
  const locale = useLocale();
  const rows = breakdown.breakdown ?? [];
  const info = analyzeBreakdown(breakdown);

  // Staff vs carrier is decided by the data (§16.5.1/§16.5.3): a board is only
  // ever passed by ClaimModal, and the API never sends one to a carrier.
  const staffBoard = boardSettlement ?? null;
  const audience = staffBoard !== null ? 'staff' : 'carrier';
  // Board columns: mixed period (server flag) AND a board to show. An
  // all-active period stays exactly as before even if a board is passed in.
  const boardMode = info.boardSettled && staffBoard !== null;
  const boardByMonth = boardMode ? boardMonthIndex(staffBoard) : null;
  const boardFor = (yearMonth: string): BoardCell | null =>
    boardByMonth ? boardCell(boardByMonth.get(yearMonth)) : null;
  // «Razem» of the «Km wg weryfikatora» column (tfoot + the card total): the
  // LIVE board total, `boardSettlement.mileageEffective` — the same source as
  // the month rows above it, so the column always adds up. Not
  // `breakdown.mileageEffective`: that is the km the claim was last priced on
  // and goes stale once the weryfikator fills a day. This is a km figure, not
  // money — the payout is shown only in ClaimModal's dopłata field.
  const boardTotalKm = formatOptionalInt(boardColumnTotalKm(staffBoard));

  // Whole period without a guarantee → an honest empty state instead of a
  // table of zeroes. The «Razem» footer and the boundary-day strip go with it
  // (a zero total under an empty state says nothing), and the mixed-period
  // notice is suppressed — one explanation per fact.
  if (info.allDisabled) {
    return (
      <div
        className={cn(
          '@container bg-card rounded-lg border border-border overflow-hidden',
          className,
        )}
      >
        <EmptyState
          icon={CalendarOff}
          title={t('allDisabledTitle')}
          message={t('allDisabledBody')}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        // `@container` establishes the container-query context; the card/table
        // toggle below is keyed on THIS element's width, not the viewport.
        '@container bg-card rounded-lg border border-border overflow-hidden',
        className,
      )}
    >
      {info.showMixedNotice && (
        <GuaranteeGapNotice audience={audience} count={info.offMonthCount} />
      )}

      {/* Stacked cards — container narrower than 34rem (cramped modal column,
          phone); 40rem with the staff board columns, which make the table 7
          columns wide. Literal class strings on purpose: Tailwind v4 scans the
          source, an interpolated `@min-[${bp}]` would generate no CSS. No
          horizontal scroll. */}
      <div
        className={
          boardMode
            ? '@max-[40rem]:block @min-[40rem]:hidden p-3'
            : '@max-[34rem]:block @min-[34rem]:hidden p-3'
        }
      >
        {rows.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-text-sub">
            {t('empty')}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {rows.map((row) => (
                <CardMonth
                  key={row.yearMonth}
                  row={row}
                  locale={locale}
                  board={boardFor(row.yearMonth)}
                />
              ))}
            </ul>
            {boardMode ? (
              <div className="mt-3 rounded-md bg-bg px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                    {t('totalKmGuaranteed')}
                  </span>
                  <span className="tabular-nums font-extrabold text-text">
                    {formatInt(breakdown.kmGuaranteed)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                    {t('boardTotalKm')}
                  </span>
                  <span className="tabular-nums font-extrabold text-text">
                    {boardTotalKm}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-baseline justify-between gap-2 rounded-md bg-bg px-3 py-2.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                  {t('totalKmGuaranteed')}
                </span>
                <span className="tabular-nums font-extrabold text-text">
                  {formatInt(breakdown.kmGuaranteed)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Table — container at least 34rem wide (preview panel, roomy modal);
          40rem with the staff board columns. */}
      <div
        className={
          boardMode
            ? '@max-[40rem]:hidden @min-[40rem]:block overflow-x-auto'
            : '@max-[34rem]:hidden @min-[34rem]:block overflow-x-auto'
        }
      >
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
              {/* Board columns sit right of «Km/mc» so each row reads as the
                  pair «gwarantowano X → przejechano Y» (§16.5.5). */}
              {boardMode && (
                <>
                  <th
                    scope="col"
                    className="px-2 py-2 h-10 text-right text-xs font-bold uppercase tracking-wide text-text-sub border-b border-l border-border whitespace-nowrap"
                  >
                    {t('boardKm')}
                  </th>
                  <th
                    scope="col"
                    className="px-2 py-2 h-10 text-right text-xs font-bold uppercase tracking-wide text-text-sub border-b border-border whitespace-nowrap"
                  >
                    {t('boardDays')}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={boardMode ? 7 : 5}
                  className="px-2 py-8 text-center text-sm text-text-sub"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <TableMonthRow
                key={row.yearMonth}
                row={row}
                locale={locale}
                board={boardFor(row.yearMonth)}
              />
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-bg font-extrabold">
                {/* With the board columns one label heads two different totals,
                    so it is the plain «Razem» — the column headers say which is
                    which. «Wpisane dni» is not summed: days and Saturdays of
                    different months do not add up to a meaningful number. */}
                <td
                  colSpan={4}
                  className="px-2 py-2 h-10 text-text uppercase text-xs tracking-wide whitespace-nowrap"
                >
                  {boardMode ? t('total') : t('totalKmGuaranteed')}
                </td>
                <td className="px-2 py-2 h-10 text-right tabular-nums text-text whitespace-nowrap">
                  {formatInt(breakdown.kmGuaranteed)}
                </td>
                {boardMode && (
                  <>
                    <td className="px-2 py-2 h-10 text-right tabular-nums text-text whitespace-nowrap border-l border-border">
                      {boardTotalKm}
                    </td>
                    <td className="px-2 py-2 h-10" />
                  </>
                )}
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
