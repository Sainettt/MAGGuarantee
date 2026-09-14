'use client';

// <KmBoardScreen> — the shared page body for BOTH the weryfikator editable
// km-board (`mode="edit"`) and the read-only km-report (`mode="view"`) per
// docs/14-design-system.md §7.7. One screen, gated by `mode`:
//   • header heading + subtitle (i18n `weryfikator.km.*`)
//   • six <KmHeaderTiles> (kept visible during refetch)
//   • <WeekNavigator> (URL `?week=YYYY-Www` is the source of truth)
//   • edit: a «{n}/{total} uzupełnionych» progress helper (fresh-week ≠ empty)
//     view: a non-dismissible read-only banner + «Tylko jeżdżące» filter (on)
//   • <KmWeekGrid mode> + <VehicleMonthKmModal> (read-only monthly km-calendar)
//
// The week lives in the URL via `usePathname`/`useSearchParams` so navigation is
// shareable + back-button-friendly. Cell commits (edit) are optimistic +
// silent-on-success, error-only toast + rollback (DS §7.7.4).

import { Gauge, Info, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  SetVehicleDailyKmDto,
  VehicleKmBoardItemDto,
  VehicleKmCellDto,
} from '@magguarantee/shared';

import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { KmHeaderTiles } from '@/components/km/KmHeaderTiles';
import {
  KmCellEditorDialog,
  type KmEditorTarget,
} from '@/components/km/KmCellEditorDialog';
import { KmWeekGrid } from '@/components/km/KmWeekGrid';
import { VehicleMonthKmModal } from '@/components/km/VehicleMonthKmModal';
import { WeekNavigator } from '@/components/km/WeekNavigator';
import {
  useClearVehicleDailyKm,
  useSetVehicleDailyKm,
  useVehicleKmBoard,
  useVehicleKmReport,
} from '@/lib/hooks/useVehicleKm';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import {
  formatDayMonthYear,
  isoWeekLabel,
  isoWeekParam,
  weekParamToMonday,
  weekdayIndexMonFirst,
} from '@/lib/format/week';

const WEEKDAY_KEYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

/**
 * §7.8 «Moje pojazdy — przebieg» role scope. When set, the screen switches its
 * chrome (heading, subtitle, read-only banner, empty-state, filter label) to
 * the `myKm.*` namespace and picks the role-specific subtitle. Unset ⇒ the
 * §7.7 weryfikator board / read-report chrome (unchanged).
 */
type MyKmScope = 'carrier' | 'opiekun' | 'planista' | 'dyspozytor';

interface KmBoardScreenProps {
  mode: 'edit' | 'view';
  /**
   * §7.8.5 — default state of the «Tylko jeżdżące» filter. Default `true` so
   * §7.7 callers are unchanged; the §7.8 tab passes `false` (show ALL vehicles
   * incl. parked/blank-week, the fleet-oversight purpose).
   */
  inMotionDefault?: boolean;
  /**
   * §7.8.1 — pass through to `<KmWeekGrid>`. Groups rows into per-carrier
   * sections when ≥2 distinct carriers are present. Default `false`.
   */
  groupByCarrier?: boolean;
  /** §7.8 — when set, render the `myKm.*` chrome scoped to this role. */
  myKmScope?: MyKmScope;
}

export function KmBoardScreen({
  mode,
  inMotionDefault = true,
  groupByCarrier = false,
  myKmScope,
}: KmBoardScreenProps) {
  const t = useTranslations('weryfikator.km');
  const tMyKm = useTranslations('myKm');
  const tCommon = useTranslations('common');
  const tWeekday = useTranslations('weryfikator.km.weekday');

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Week = URL source of truth. Resolve `?week=YYYY-Www` → Monday `YYYY-MM-DD`.
  const weekParam = searchParams.get('week');
  const weekStart = useMemo(() => weekParamToMonday(weekParam), [weekParam]);
  const query = useMemo(() => ({ week: isoWeekParam(weekStart) }), [weekStart]);

  const setWeek = useCallback(
    (mondayIso: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('week', isoWeekParam(mondayIso));
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  // Board (edit) vs report (view) — distinct endpoints, same envelope. Only the
  // mode-relevant query is `enabled`: the km-board is `weryfikator`/`admin`-only,
  // so firing it in `view` mode would 403 for the other roles. The disabled
  // query reports `isLoading: true` (status `pending` + `fetchStatus: idle`), so
  // `isLoading`/`data` MUST be read off `activeQ` (always the enabled one) only.
  const boardQ = useVehicleKmBoard(query, { enabled: mode === 'edit' });
  const reportQ = useVehicleKmReport(query, { enabled: mode === 'view' });
  const activeQ = mode === 'edit' ? boardQ : reportQ;
  const data = activeQ.data;
  const isLoading = activeQ.isLoading;

  // Optimistic save + clear mutations (edit only). Both are silent on success
  // (the optimistic cache patch is the feedback); the modal surfaces its own
  // error banner on reject, so no toast here. The mutations resolve/reject so
  // the dialog can await them and close-on-resolve / stay-open-on-reject.
  const setCellM = useSetVehicleDailyKm(query);
  const clearCellM = useClearVehicleDailyKm(query, {
    onError: () => toast.error(t('clear.error')),
  });

  const onSaveCell = useCallback(
    async (id: string, body: SetVehicleDailyKmDto) => {
      await setCellM.mutateAsync({ id, body });
    },
    [setCellM],
  );
  const onClearCell = useCallback(
    async (id: string, date: string) => {
      await clearCellM.mutateAsync({ id, date });
    },
    [clearCellM],
  );

  // Which (vehicle, cell) is open in the modal editor (edit/board only).
  const [editorTarget, setEditorTarget] = useState<KmEditorTarget | null>(null);
  const onOpenEditor = useCallback(
    (vehicle: VehicleKmBoardItemDto, cell: VehicleKmCellDto) => {
      const wdIdx = weekdayIndexMonFirst(cell.date);
      setEditorTarget({
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        sideNumber: vehicle.sideNumber ?? null,
        carrierName: vehicle.carrier?.name ?? null,
        cell,
        weekday: tWeekday(WEEKDAY_KEYS[wdIdx]),
        dateLabel: formatDayMonthYear(cell.date),
      });
    },
    [tWeekday],
  );

  // Read-report «Tylko jeżdżące» filter — default ON in §7.7 (the report exists
  // for the vehicles that actually moved). The §7.8 tab passes
  // `inMotionDefault={false}` so the landing view shows the FULL fleet. Hides
  // rows with zero `drove` cells when on.
  const [inMotionOnly, setInMotionOnly] = useState(inMotionDefault);

  // Client-side row search — plate / side number / carrier. Lets the user jump
  // to a specific vehicle without scanning the list by eye, especially after a
  // week switch. Filters the visible rows only (no refetch).
  const [search, setSearch] = useState('');
  const searchNeedle = search.trim().toLowerCase();

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const visibleItems: VehicleKmBoardItemDto[] = useMemo(() => {
    let rows = allItems;
    if (mode === 'view' && inMotionOnly) {
      rows = rows.filter((v) => v.cells.some((c) => c.state === 'drove'));
    }
    if (searchNeedle) {
      rows = rows.filter((v) =>
        [v.plateNumber, v.sideNumber, v.carrier?.name]
          .filter((s): s is string => Boolean(s))
          .some((s) => s.toLowerCase().includes(searchNeedle)),
      );
    }
    return rows;
  }, [allItems, mode, inMotionOnly, searchNeedle]);

  // Edit-mode progress helper: vehicles with ≥1 cell this week.
  const checked = allItems.filter((v) =>
    v.cells.some((c) => c.state != null),
  ).length;

  const [historyTarget, setHistoryTarget] =
    useState<VehicleKmBoardItemDto | null>(null);

  // Filtered-empty: the board HAS vehicles, but the active client filters
  // (in-motion and/or the search needle) left nothing visible — distinct from
  // a genuinely empty board. The search-driven case applies in BOTH modes.
  const filteredEmpty =
    !isLoading && allItems.length > 0 && visibleItems.length === 0;
  // Which message to show: search-needle takes priority over the in-motion note.
  const filteredEmptyMessage = searchNeedle
    ? t('search.noResults')
    : t('empty.noMotion');

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {myKmScope
            ? tMyKm('title')
            : mode === 'edit'
              ? t('title.board')
              : t('title.report')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">
          {myKmScope
            ? tMyKm(`subtitle.${myKmScope}`, { week: isoWeekLabel(weekStart) })
            : t('subtitle', { week: isoWeekLabel(weekStart) })}
        </p>
      </header>

      <KmHeaderTiles
        items={allItems}
        weekStart={weekStart}
        loading={isLoading}
      />

      {/* Read-only banner (report only) — §7.7.1b: the data-lag note JOINS this
          block as a consolidated second line (`lagNoteShort`, no lock clause —
          read-only cells aren't lockable), not a separate stacked note. */}
      {mode === 'view' ? (
        <div
          className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-text-sub"
          role="note"
        >
          <p>{myKmScope ? tMyKm('readOnlyBanner') : t('readOnlyBanner')}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-text-sub">
            <Info size={14} aria-hidden="true" className="shrink-0" />
            {t('lagNoteShort')}
          </p>
        </div>
      ) : null}

      {/* Control row — week nav + (edit) lag note + progress / (view) filter.
          §7.7.1b: on the EDIT board the data-lag note (fuller `lagNote`, incl.
          the today/future-locked clause) stands ALONE in the header control
          area, left slot beside <WeekNavigator>; it wraps to its own line on
          narrow widths. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {mode === 'view' ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-input px-3 py-2 text-sm text-text">
            <Checkbox
              checked={inMotionOnly}
              onChange={(e) => setInMotionOnly(e.target.checked)}
            />
            {myKmScope ? tMyKm('filter.inMotionOnly') : t('filter.inMotionOnly')}
          </label>
        ) : (
          <div className="flex flex-col gap-1">
            <p
              className="flex items-center gap-1.5 text-xs text-text-sub"
              role="note"
            >
              <Info size={14} aria-hidden="true" className="shrink-0" />
              {t('lagNote')}
            </p>
            {!isLoading && allItems.length > 0 ? (
              <p className="text-sm text-text-sub" role="status">
                {t('progress', { checked, total: allItems.length })}
              </p>
            ) : null}
          </div>
        )}

        <WeekNavigator weekStart={weekStart} onChange={setWeek} />
      </div>

      {/* Vehicle search — filters the visible rows by plate / side / carrier so
          the user can jump straight to a vehicle after switching weeks. */}
      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-sub"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.label')}
            className="pl-9 pr-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={tCommon('clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-sub hover:bg-input hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {activeQ.isError && !data ? (
        // Load failure is not «no vehicles» — show it as an error with retry.
        <div className="rounded-xl border border-border bg-card shadow-card">
          <ErrorState {...queryErrorProps(activeQ)} />
        </div>
      ) : filteredEmpty ? (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <EmptyState icon={Gauge} message={filteredEmptyMessage} />
        </div>
      ) : (
        <KmWeekGrid
          items={visibleItems}
          weekStart={weekStart}
          mode={mode}
          isLoading={isLoading}
          groupByCarrier={groupByCarrier}
          emptyTitle={
            myKmScope ? tMyKm('title') : t('empty.noVehicles')
          }
          emptyMessage={
            myKmScope
              ? myKmScope === 'carrier'
                ? tMyKm('empty.noVehicles.carrier')
                : tMyKm('empty.noVehicles.scoped')
              : mode === 'edit'
                ? t('empty.noVehicles')
                : t('empty.noAssigned')
          }
          onOpenEditor={mode === 'edit' ? onOpenEditor : undefined}
          onOpenHistory={setHistoryTarget}
        />
      )}

      {/* Modal cell editor — board (edit) only */}
      {mode === 'edit' ? (
        <KmCellEditorDialog
          target={editorTarget}
          onOpenChange={(open) => {
            if (!open) setEditorTarget(null);
          }}
          onSave={onSaveCell}
          onClear={onClearCell}
        />
      ) : null}

      <VehicleMonthKmModal
        vehicle={historyTarget}
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null);
        }}
      />
    </section>
  );
}
