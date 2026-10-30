'use client';

// Read-only week-by-week km-calc breakdown — one row per ISO week of the claim
// period (docs/14 §18.7, since 2026-10-29). Rendered on the new-claim preview
// panel, on the carrier's claim page AND inside the (narrow) employee claim
// modal. The row shape is `WeekBreakdownDto` from `@magguarantee/shared`.
//
// Responsive strategy (docs/14 §`<BreakdownTable>` «Responsive behavior»,
// §18.7.4) — CONTAINER QUERIES, not viewport breakpoints. The breakdown lives
// inside a modal column whose width is unrelated to the viewport, so the root
// is a `@container` and the layout is picked by the component's OWN width:
//   • container `≥ 36rem` (staff `≥ 46rem`): the 6-column <table> (staff 8),
//     `text-xs` + `px-2`, `whitespace-nowrap` headers;
//   • below that: ONE COLLAPSED ROW per week (§18.7.3) — label, mode badge and
//     «Km/tydz.» on one line; tapping expands a <dl> with the details and the
//     excluded days. 13 weeks of 2×2 cards would be ~1 600 px on a phone.
// Both layouts are always rendered; the toggle is two LITERAL class sets
// (Tailwind v4 scans the source — an interpolated `@min-[${bp}]` generates no
// CSS). No horizontal scroll in the narrow layout, ever.
//
// Row label «Tydz. 23 · 03.06–07.06» is clipped to the claim period, with the
// full week in `title` / sr-only (`<IsoWeekLabel>`). Rows are neither collapsed
// nor grouped by month: a finance breakdown hides nothing, and grouping by the
// Thursday's month would put «29.06–05.07» under July.
//
// SATURDAY — its own «Sob.» column (§18.7.1), so `Dni × Km/dz. + Sob. =
// Km/tydz.` is visible arithmetic. Three states (shared `weekSaturdayStatus`):
// credited km; `0` muted — the week has a Saturday guarantee but its Saturday
// was not credited (outside the period / an excluded day, which then sits in
// «Dni wyłączone»); `—` muted — the week has no Saturday guarantee.
//
// SWITCHED-OFF WEEKS (§16.5.2) — a week whose guarantee is off pays nothing,
// and a row of zeroes with no explanation reads as a bug. Derived from the
// row (see `lib/claims/breakdownGuarantee.ts`): a fully-off week is muted and
// badged «Gwarancja wyłączona», a Saturday-only week is badged «Tylko sobota»
// but NOT muted (it pays), and an off week's €/km is «—», never the engine's
// 0,50 fallback (a price per kilometre is meaningless with zero kilometres).
// A period that is off end-to-end renders an <EmptyState> instead.
//
// MIXED PERIOD (§16.5.1/§16.5.3/§16.5.5, docs/20 §0⁵) — ONLY when the server
// says so (`breakdown.mileageSource === 'board'`, never re-derived from the
// rows): the payout is settled on the weryfikator's daily-km board, so the
// neutral <GuaranteeGapNotice> goes ABOVE the numbers. Two audiences, decided
// by data, not by role:
//   • carrier (no `boardSettlement` prop) — one notice, no board figures, and
//     `mileageEffective` is shown nowhere;
//   • staff (`boardSettlement` passed by ClaimModal) — the staff notice plus two
//     board columns right of «Km/tydz.» («Km wg weryfikatora», «Wpisane dni»),
//     joined by `isoWeek`, a «Razem» footer pairing guaranteed km with the live
//     board total, and a 46rem (not 36rem) layout threshold.

import { useId, useState } from 'react';
import {
  AlertTriangle,
  CalendarOff,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  formatDaysPl,
  type BoundaryDayDto,
  type ClaimBoardSettlement,
  type KmCalcBreakdown,
  type WeekBreakdownDto,
} from '@magguarantee/shared';

import IsoWeekLabel from '@/components/claims/IsoWeekLabel';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LockNotice } from '@/components/ui/LockNotice';
import {
  analyzeBreakdown,
  boardCell,
  boardColumnTotalKm,
  boardWeekIndex,
  isWeekdayGuaranteeOff,
  saturdayCell,
  weekGuaranteeMode,
  type BoardCell,
  type BoardValueCell,
  type SaturdayCell,
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
   * breakdown from another — after a period edit the weeks would not line
   * up). Passed only by ClaimModal; the carrier pages never pass it and the
   * API never sends it to a carrier. The component does not check the role:
   * the staff variant is chosen by the data (§16.5.1). Ignored unless
   * `breakdown.mileageSource === 'board'`, so an all-active period looks
   * exactly as before even if a board is passed in.
   */
  boardSettlement?: ClaimBoardSettlement | null;
  className?: string;
}

const TH =
  'px-2 py-2 h-10 text-xs font-bold uppercase tracking-wide text-text-sub border-b border-border whitespace-nowrap';
const TD_NUM = 'px-2 py-2 h-10 text-right tabular-nums align-middle whitespace-nowrap';

/** The «Gwarancja wyłączona» / «Tylko sobota» chip — outline, never loud. */
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

/** The mode badge of a week; `short` in the collapsed rows (§18.7.3). */
function WeekModeBadge({
  row,
  short = false,
}: {
  row: WeekBreakdownDto;
  short?: boolean;
}) {
  const t = useTranslations('carrier.breakdown');
  const mode = weekGuaranteeMode(row);
  if (mode === 'disabled') {
    return (
      <GuaranteeBadge
        label={t(short ? 'guaranteeDisabledShort' : 'guaranteeDisabled')}
      />
    );
  }
  if (mode === 'saturdayOnly') {
    return (
      <GuaranteeBadge
        label={t(short ? 'guaranteeSaturdayOnlyShort' : 'guaranteeSaturdayOnly')}
      />
    );
  }
  return null;
}

// ── Mixed-period notice (composition, not a primitive) ──────────────
// Rendered ABOVE the table: the zero rows are what look broken, so the
// explanation has to be read BEFORE the figures. Deliberately neutral (not a
// warning): nothing went wrong, this IS the configuration. Missing board days
// are a separate, amber notice in ClaimModal (staff only) — never mixed in here.
// No km or day figures in either text (§16.5.3): the only parameter is the
// number of weeks without a (weekday) guarantee.

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

// ── «Sob.» — the week's Saturday (§18.7.1) ──────────────────────────
// `counted` → the credited km; `notCounted` → `0`, `none` → «—», both muted
// with a native title that says which of the two it is.

function useSaturdayDisplay(cell: SaturdayCell): {
  text: string;
  muted: boolean;
  title: string | undefined;
} {
  const t = useTranslations('carrier.breakdown');
  if (cell.status === 'counted') {
    return { text: formatInt(cell.km), muted: false, title: undefined };
  }
  if (cell.status === 'notCounted') {
    return { text: '0', muted: true, title: t('saturdayNotCountedTitle') };
  }
  return { text: '—', muted: true, title: t('saturdayNoneTitle') };
}

// ── Staff board cells (§16.5.5, §18.7.2) ────────────────────────────
// «Wpisane dni» value: «5 z 5» / «1 z 1 sob.». An incomplete week is amber
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
  if (cell.kind !== 'value') {
    // A number that takes no part in the settlement is not printed (same rule
    // as the ghost rate, §16.5.2).
    return (
      <>
        <td
          className={cn(TD_NUM, 'border-l border-border text-text-sub')}
          title={cell.kind === 'off' ? t('boardOffTitle') : undefined}
        >
          —
        </td>
        <td className={cn(TD_NUM, 'text-text-sub')}>—</td>
      </>
    );
  }
  return (
    <>
      <td className={cn(TD_NUM, 'border-l border-border font-semibold text-text')}>
        {formatInt(cell.km)}
      </td>
      <td className={TD_NUM}>
        <BoardDaysValue cell={cell} />
      </td>
    </>
  );
}

// ── Shared excluded-days disclosure ──────────────────────────────────
// Rendered once per expanded week, identical in the table and in the
// collapsed-row layout.

interface ExcludedDaysProps {
  excluded: WeekBreakdownDto['excludedDays'];
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
// ONCE at the block root so it appears identically under both layouts.
//   • single-day period → engine reports the same date+fraction on both
//     boundaries, so we collapse to one line.
//   • fraction 0 → that boundary day wasn't counted (Sunday / EU-ban / a
//     Saturday that was not credited); shown muted with "not counted".
//   • both null → empty range → the whole strip is omitted.

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

// ── <WeekToggle> — chevron + week label + excluded-day count ─────────
// The table's disclosure for «Dni wyłączone» (formerly <MonthToggle>). Its
// accessible name is its content — the week label and the count — with
// `aria-expanded` for the state; a week without excluded days is plain text,
// indented to line up with the toggles.

interface WeekToggleProps {
  row: WeekBreakdownDto;
  open: boolean;
  onToggle: () => void;
  excludedCount: number;
}

function WeekToggle({ row, open, onToggle, excludedCount }: WeekToggleProps) {
  const t = useTranslations('carrier.breakdown');
  const label = (
    <IsoWeekLabel
      isoWeek={row.isoWeek}
      periodStart={row.periodStart}
      periodEnd={row.periodEnd}
    />
  );
  if (excludedCount === 0) {
    return <span className="pl-[22px] text-text">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex items-center gap-1.5 rounded-sm text-text transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <ChevronDown
        size={14}
        aria-hidden
        className={cn(
          'shrink-0 transition-transform',
          open ? 'rotate-0' : '-rotate-90',
        )}
      />
      {label}
      <span className="whitespace-nowrap text-xs text-text-sub">
        ({t('excludedDaysCount', { count: excludedCount })})
      </span>
    </button>
  );
}

// ── Table layout (container ≥ 36rem, staff ≥ 46rem) ─────────────────

function TableWeekRow({
  row,
  locale,
  board,
}: {
  row: WeekBreakdownDto;
  locale: string;
  /** Staff board cells for this week; `null` ⇒ no board columns at all. */
  board: BoardCell | null;
}) {
  const t = useTranslations('carrier.breakdown');
  const [open, setOpen] = useState(false);
  const excluded = row.excludedDays ?? [];
  const disabled = weekGuaranteeMode(row) === 'disabled';
  const weekdaysOff = isWeekdayGuaranteeOff(row);
  const saturday = useSaturdayDisplay(saturdayCell(row));
  // Full-width sub-rows span the board columns too when they are present.
  const span = board ? 8 : 6;

  return (
    <>
      <tr
        className={cn(
          'border-b border-border last:border-b-0',
          // The ONE muted row state: guarantee off. Saturday-only weeks stay
          // normal — they pay.
          disabled && 'bg-input/40',
        )}
      >
        <td className="px-2 py-2 h-10 align-middle">
          <div className="flex flex-wrap items-center gap-1.5">
            <WeekToggle
              row={row}
              open={open}
              onToggle={() => setOpen((v) => !v)}
              excludedCount={excluded.length}
            />
            <WeekModeBadge row={row} />
          </div>
        </td>
        <td className={cn(TD_NUM, 'text-text')}>
          {formatDaysPl(row.workingDays)}
        </td>
        <td className={cn(TD_NUM, weekdaysOff ? 'text-text-sub' : 'text-text')}>
          {formatInt(row.kmPerDay)}
        </td>
        <td
          className={cn(TD_NUM, saturday.muted ? 'text-text-sub' : 'text-text')}
          title={saturday.title}
        >
          {saturday.text}
        </td>
        <td
          className={cn(TD_NUM, disabled ? 'text-text-sub' : 'text-text')}
          title={disabled ? t('rateNoneTitle') : undefined}
        >
          {/* Ghost rate: with zero guaranteed km the rate is not a price —
              «—» (§16.5.2, locked). */}
          {disabled ? '—' : formatRate(row.ratePerKm)}
        </td>
        <td
          className={cn(
            TD_NUM,
            disabled ? 'text-text-sub' : 'font-semibold text-text',
          )}
        >
          {formatInt(row.kmInWeek)}
        </td>
        {board && <BoardTableCells cell={board} />}
      </tr>
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

// ── Collapsed-row layout (container < 36rem, staff < 46rem, §18.7.3) ──
// One line per week: the whole line is the disclosure button (label, mode
// badge, the staff «incomplete board» triangle and «Km/tydz.» stay visible
// while collapsed); the expansion holds the metrics and «Dni wyłączone».

/** One `dt`/`dd` pair of the expansion. */
function DetailPair({
  label,
  children,
  className,
  title,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2', className)}>
      <dt className="text-text-sub">{label}</dt>
      <dd className="tabular-nums" title={title}>
        {children}
      </dd>
    </div>
  );
}

function CollapsedWeekRow({
  row,
  locale,
  board,
}: {
  row: WeekBreakdownDto;
  locale: string;
  /** Staff board block for this week; `null` ⇒ no board rows at all. */
  board: BoardCell | null;
}) {
  const t = useTranslations('carrier.breakdown');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const excluded = row.excludedDays ?? [];
  const disabled = weekGuaranteeMode(row) === 'disabled';
  const weekdaysOff = isWeekdayGuaranteeOff(row);
  const saturday = useSaturdayDisplay(saturdayCell(row));
  const boardMissing = board?.kind === 'value' ? board.missing : 0;

  return (
    <li className={cn(disabled && 'bg-input/40')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full min-h-11 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-input/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
      >
        <ChevronRight
          size={14}
          aria-hidden
          className={cn(
            'shrink-0 text-text-sub transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {/* May wrap here (only here): the narrow layout must never clip or
              scroll, even with a year in the range on a 320px phone. */}
          <IsoWeekLabel
            isoWeek={row.isoWeek}
            periodStart={row.periodStart}
            periodEnd={row.periodEnd}
            className="whitespace-normal text-sm text-text"
          />
          <WeekModeBadge row={row} short />
          {boardMissing > 0 && (
            // Staff: the incomplete-board signal is visible while collapsed.
            <span className="inline-flex items-center text-warning-dark dark:text-warning">
              <AlertTriangle size={12} aria-hidden className="shrink-0" />
              <span className="sr-only">
                {t('boardDaysMissingSr', { count: boardMissing })}
              </span>
            </span>
          )}
        </span>
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-sm tabular-nums',
            disabled ? 'text-text-sub' : 'font-semibold text-text',
          )}
        >
          {formatInt(row.kmInWeek)} km
        </span>
      </button>

      <div id={panelId} hidden={!open} className="px-3 pb-3 pl-8">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <DetailPair label={t('workingDays')}>
            <span className="text-text">{formatDaysPl(row.workingDays)}</span>
          </DetailPair>
          <DetailPair label={t('kmPerDay')}>
            <span className={weekdaysOff ? 'text-text-sub' : 'text-text'}>
              {formatInt(row.kmPerDay)}
            </span>
          </DetailPair>
          <DetailPair label={t('saturday')} title={saturday.title}>
            <span className={saturday.muted ? 'text-text-sub' : 'text-text'}>
              {saturday.text}
            </span>
          </DetailPair>
          {/* An off week has no €/km pair at all — a cell can only be blanked
              to «—», a list row can go away (§16.5.2). */}
          {!disabled && (
            <DetailPair label={t('ratePerKm')}>
              <span className="text-text">{formatRate(row.ratePerKm)}</span>
            </DetailPair>
          )}
          {/* Staff board block (§16.5.5) — full-width rows («Km wg
              weryfikatora» does not fit half a row). An `off` week has no
              block at all. */}
          {board && board.kind !== 'off' && (
            <>
              <DetailPair
                label={t('boardKm')}
                className="col-span-2 border-t border-border/60 pt-2"
              >
                {board.kind === 'value' ? (
                  <span className="font-semibold text-text">
                    {formatInt(board.km)}
                  </span>
                ) : (
                  <span className="text-text-sub">—</span>
                )}
              </DetailPair>
              <DetailPair label={t('boardDays')} className="col-span-2">
                {board.kind === 'value' ? (
                  <BoardDaysValue cell={board} />
                ) : (
                  <span className="text-text-sub">—</span>
                )}
              </DetailPair>
            </>
          )}
        </dl>
        {excluded.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <ExcludedDays excluded={excluded} locale={locale} />
          </div>
        )}
      </div>
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
  const boardByWeek = boardMode ? boardWeekIndex(staffBoard) : null;
  const boardFor = (isoWeek: string): BoardCell | null =>
    boardByWeek ? boardCell(boardByWeek.get(isoWeek)) : null;
  // «Razem» of the «Km wg weryfikatora» column (tfoot + the collapsed total):
  // the LIVE board total, `boardSettlement.mileageEffective` — the same source
  // as the week rows above it, so the column always adds up. Not
  // `breakdown.mileageEffective`: that is the km the claim was last priced on
  // and goes stale once the weryfikator fills a day. A km figure, not money —
  // the payout is shown only in ClaimModal's dopłata field.
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
        // `@container` establishes the container-query context; the layout
        // toggle below is keyed on THIS element's width, not the viewport.
        '@container bg-card rounded-lg border border-border overflow-hidden',
        className,
      )}
    >
      {info.showMixedNotice && (
        <GuaranteeGapNotice audience={audience} count={info.offWeekCount} />
      )}

      {/* Collapsed rows — container narrower than 36rem (cramped modal
          column, phone); 46rem with the staff board columns, which make the
          table 8 columns wide. Literal class strings on purpose (see the file
          header). No horizontal scroll. */}
      <div
        className={
          boardMode
            ? '@max-[46rem]:block @min-[46rem]:hidden'
            : '@max-[36rem]:block @min-[36rem]:hidden'
        }
      >
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-text-sub">
            {t('empty')}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <CollapsedWeekRow
                  key={row.isoWeek}
                  row={row}
                  locale={locale}
                  board={boardFor(row.isoWeek)}
                />
              ))}
            </ul>
            <div className="border-t border-border bg-bg px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                  {t('totalKmGuaranteed')}
                </span>
                <span className="tabular-nums font-extrabold text-text">
                  {formatInt(breakdown.kmGuaranteed)}
                </span>
              </div>
              {boardMode && (
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-text">
                    {t('boardTotalKm')}
                  </span>
                  <span className="tabular-nums font-extrabold text-text">
                    {boardTotalKm}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Table — container at least 36rem wide (preview panel, roomy modal);
          46rem with the staff board columns. */}
      <div
        className={
          boardMode
            ? '@max-[46rem]:hidden @min-[46rem]:block overflow-x-auto'
            : '@max-[36rem]:hidden @min-[36rem]:block overflow-x-auto'
        }
      >
        <table className="w-full text-xs">
          <thead className="bg-bg">
            <tr>
              <th scope="col" className={cn(TH, 'text-left')}>
                {t('week')}
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                {t('workingDays')}
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                {t('kmPerDay')}
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                {t('saturday')}
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                {t('ratePerKm')}
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                {t('kmInWeek')}
              </th>
              {/* Board columns sit right of «Km/tydz.» so each row reads as
                  the pair «gwarantowano X → przejechano Y» (§16.5.5). */}
              {boardMode && (
                <>
                  <th scope="col" className={cn(TH, 'border-l text-right')}>
                    {t('boardKm')}
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
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
                  colSpan={boardMode ? 8 : 6}
                  className="px-2 py-8 text-center text-sm text-text-sub"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <TableWeekRow
                key={row.isoWeek}
                row={row}
                locale={locale}
                board={boardFor(row.isoWeek)}
              />
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-bg font-extrabold">
                {/* With the board columns one label heads two different totals,
                    so it is the plain «Razem» — the column headers say which is
                    which. «Wpisane dni» is not summed: days and Saturdays of
                    different weeks do not add up to a meaningful number. */}
                <td
                  colSpan={5}
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

      {/* Boundary-day fractions — one strip below both layouts (rendered only
          when there are week rows and the engine surfaced the boundaries). */}
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
