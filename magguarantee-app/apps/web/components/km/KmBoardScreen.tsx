'use client';

// <KmBoardScreen> — the shared page body for BOTH the weryfikator editable
// km-board (`mode="edit"`) and the read-only km-report (`mode="view"`) per
// docs/14-design-system.md §7.7. One screen, gated by `mode`:
//   • header heading + subtitle (i18n `weryfikator.km.*`)
//   • six <KmHeaderTiles> (kept visible during refetch)
//   • <WeekNavigator> (URL `?week=YYYY-Www` is the source of truth)
//   • edit: a «{n}/{total} uzupełnionych» progress helper (fresh-week ≠ empty)
//     view: a non-dismissible read-only banner + «Tylko jeżdżące» filter (on)
//   • <KmWeekGrid mode> + <VehicleKmHistoryDialog>
//
// The week lives in the URL via `usePathname`/`useSearchParams` so navigation is
// shareable + back-button-friendly. Cell commits (edit) are optimistic +
// silent-on-success, error-only toast + rollback (DS §7.7.4).

import { Gauge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  SetVehicleDailyKmDto,
  VehicleKmBoardItemDto,
} from '@magguarantee/shared';

import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { KmHeaderTiles } from '@/components/km/KmHeaderTiles';
import { KmWeekGrid } from '@/components/km/KmWeekGrid';
import { VehicleKmHistoryDialog } from '@/components/km/VehicleKmHistoryDialog';
import { WeekNavigator } from '@/components/km/WeekNavigator';
import {
  useSetVehicleDailyKm,
  useVehicleKmBoard,
  useVehicleKmReport,
} from '@/lib/hooks/useVehicleKm';
import {
  isoWeekLabel,
  isoWeekParam,
  weekParamToMonday,
} from '@/lib/format/week';

interface KmBoardScreenProps {
  mode: 'edit' | 'view';
}

export function KmBoardScreen({ mode }: KmBoardScreenProps) {
  const t = useTranslations('weryfikator.km');

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

  // Board (edit) vs report (view) — distinct endpoints, same envelope.
  const boardQ = useVehicleKmBoard(query);
  const reportQ = useVehicleKmReport(query);
  const activeQ = mode === 'edit' ? boardQ : reportQ;
  const data = activeQ.data;
  const isLoading = activeQ.isLoading;

  // Optimistic in-cell mutation (edit only). Silent on success; error toasts.
  const setCellM = useSetVehicleDailyKm(query, {
    onError: () => toast.error(t('toast.saveError')),
  });
  const onCommitCell = useCallback(
    (id: string, body: SetVehicleDailyKmDto) => {
      setCellM.mutate({ id, body });
    },
    [setCellM],
  );

  // Read-report «Tylko jeżdżące» filter — default ON (the report exists for the
  // vehicles that actually moved). Hides rows with zero `drove` cells.
  const [inMotionOnly, setInMotionOnly] = useState(true);

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const visibleItems: VehicleKmBoardItemDto[] = useMemo(() => {
    if (mode === 'view' && inMotionOnly) {
      return allItems.filter((v) => v.cells.some((c) => c.state === 'drove'));
    }
    return allItems;
  }, [allItems, mode, inMotionOnly]);

  // Edit-mode progress helper: vehicles with ≥1 cell this week.
  const checked = allItems.filter((v) =>
    v.cells.some((c) => c.state != null),
  ).length;

  const [historyTarget, setHistoryTarget] =
    useState<VehicleKmBoardItemDto | null>(null);

  // Filtered-empty (view + filter on, nothing moved): distinct from no-vehicles.
  const filteredEmpty =
    mode === 'view' &&
    inMotionOnly &&
    !isLoading &&
    allItems.length > 0 &&
    visibleItems.length === 0;

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {mode === 'edit' ? t('title.board') : t('title.report')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">
          {t('subtitle', { week: isoWeekLabel(weekStart) })}
        </p>
      </header>

      <KmHeaderTiles
        items={allItems}
        weekStart={weekStart}
        loading={isLoading}
      />

      {/* Read-only banner (report only) */}
      {mode === 'view' ? (
        <div
          className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-text-sub"
          role="note"
        >
          {t('readOnlyBanner')}
        </div>
      ) : null}

      {/* Control row — week nav + (edit) progress / (view) filter */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {mode === 'view' ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-input px-3 py-2 text-sm text-text">
            <Checkbox
              checked={inMotionOnly}
              onChange={(e) => setInMotionOnly(e.target.checked)}
            />
            {t('filter.inMotionOnly')}
          </label>
        ) : !isLoading && allItems.length > 0 ? (
          <p className="text-sm text-text-sub" role="status">
            {t('progress', { checked, total: allItems.length })}
          </p>
        ) : (
          <span />
        )}

        <WeekNavigator weekStart={weekStart} onChange={setWeek} />
      </div>

      {filteredEmpty ? (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <EmptyState icon={Gauge} message={t('empty.noMotion')} />
        </div>
      ) : (
        <KmWeekGrid
          items={visibleItems}
          weekStart={weekStart}
          mode={mode}
          isLoading={isLoading}
          emptyTitle={t('empty.noVehicles')}
          emptyMessage={
            mode === 'edit' ? t('empty.noVehicles') : t('empty.noAssigned')
          }
          onCommitCell={mode === 'edit' ? onCommitCell : undefined}
          onOpenHistory={setHistoryTarget}
        />
      )}

      <VehicleKmHistoryDialog
        vehicle={historyTarget}
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null);
        }}
      />
    </section>
  );
}
