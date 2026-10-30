'use client';

// Admin `/employee/limits` — km limits per ISO week (docs/14 §18, since
// 2026-10-29; replaced the 12-row monthly table).
//
//   header       title · ISO hint · «53 tygodnie · 29.12.2025 – 03.01.2027»
//                [‹] 2026 [›] [Bieżący tydzień]
//   notice       ONE page-level note when weeks fall back to 540 / 0,50,
//                with «Zaznacz te tygodnie»
//   calendar     12 month rows × week tiles (`<LimitsCalendar>`)
//   panel        `<WeekEditPanel>` — docked ≥ 1280 px, a <Sheet> below
//
// This view owns the selection (click / Shift / Ctrl, month, quarter, year,
// the unconfigured weeks, «Od tyg. … do …»), the grid keyboard (§18.5.3), the
// bulk form (its plan also drives the in-tile preview) and the URL
// (`?week=2026-W23` for one selected week — shareable; the year follows from
// the week). The selection never crosses years: switching the year drops it.
//
// Dates are calendar days: weeks come from the shared ISO-week helpers, the
// current week from `businessTodayIso()` (Europe/Warsaw) — nothing here
// depends on the browser's time zone.

import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { toast } from 'sonner';
import {
  BulkUpdateWeeklyLimitsSchema,
  FALLBACK_KM_PER_DAY,
  FALLBACK_RATE_PER_KM,
  businessTodayIso,
  isoWeekOfDate,
  parseIsoWeekKey,
  type UpdateWeeklyLimitDto,
  type WeeklyLimitDto,
} from '@magguarantee/shared';

import LimitsCalendar from '@/components/limits/LimitsCalendar';
import type { PanelFocusRequest } from '@/components/limits/SingleWeekForm';
import WeekEditPanel from '@/components/limits/WeekEditPanel';
import type { TileClickModifiers, WeekTilePreview } from '@/components/limits/WeekTile';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LockNotice } from '@/components/ui/LockNotice';
import { Sheet, SheetBody, SheetContent } from '@/components/ui/Sheet';
import { formatDateWithYear } from '@/lib/format/weekLabel';
import {
  useBulkUpdateLimits,
  useLimits,
  useSerializedUpdateLimit,
  weekKeyOf,
} from '@/lib/hooks/useLimits';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import {
  EMPTY_BULK_FORM,
  buildBulkPayload,
  buildBulkSummary,
  type BulkFormValues,
} from '@/lib/limits/bulkPlan';
import {
  buildCalendarYear,
  moveWeek,
  normalizeWeeks,
  toggleWeek,
  weekRange,
  type GridMove,
} from '@/lib/limits/calendarGrid';
import {
  WEEK_LIMIT_FIELDS,
  formatKmValue,
  formatRateValue,
  unconfiguredWeeks,
  weekValues,
  type WeekLimitField,
} from '@/lib/limits/limitState';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import { cn } from '@/lib/utils';

const MIN_YEAR = 2020;

interface Selection {
  /** Selected ISO weeks of the shown year, ascending. */
  weeks: number[];
  /** Shift+click / Shift+arrow extends from here. */
  anchor: number | null;
}

const NO_SELECTION: Selection = { weeks: [], anchor: null };

const ARROW_MOVES: Record<string, GridMove> = {
  ArrowLeft: 'prev',
  ArrowRight: 'next',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export function LimitsView() {
  const t = useTranslations('limits');
  const tWeek = useTranslations('common.isoWeek');
  const locale = useLocale();
  const searchParams = useSearchParams();

  // ── Today / the current week (Europe/Warsaw business day) ──────────
  const todayIso = useMemo(() => businessTodayIso(), []);
  const current = useMemo(
    () => isoWeekOfDate(todayIso) ?? { isoYear: MIN_YEAR, isoWeek: 1 },
    [todayIso],
  );
  const maxYear = current.isoYear + 2;

  // ── Initial state from the URL (`?week=2026-W23`, else `?year=`) ───
  const [initial] = useState(() => {
    const fromWeek = parseIsoWeekKey(searchParams.get('week'));
    if (fromWeek && fromWeek.isoYear >= MIN_YEAR && fromWeek.isoYear <= maxYear) {
      return {
        year: fromWeek.isoYear,
        selection: { weeks: [fromWeek.isoWeek], anchor: fromWeek.isoWeek },
        focus: fromWeek.isoWeek as number | null,
      };
    }
    const yearParam = Number(searchParams.get('year'));
    const year =
      Number.isInteger(yearParam) && yearParam >= MIN_YEAR && yearParam <= maxYear
        ? yearParam
        : current.isoYear;
    return { year, selection: NO_SELECTION, focus: null as number | null };
  });

  const [year, setYear] = useState(initial.year);
  const [selection, setSelection] = useState<Selection>(initial.selection);
  const [focusWeek, setFocusWeek] = useState<number | null>(initial.focus);
  const [bulkForm, setBulkForm] = useState<BulkFormValues>(EMPTY_BULK_FORM);
  const [focusRequest, setFocusRequest] = useState<PanelFocusRequest | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string; nonce: number } | null>(null);
  const nonceRef = useRef(0);
  const nextNonce = (): number => {
    nonceRef.current += 1;
    return nonceRef.current;
  };

  const calendar = useMemo(() => buildCalendarYear(year), [year]);
  const limitsQ = useLimits(year);
  const { data } = limitsQ;
  const status: 'loading' | 'error' | 'ready' = limitsQ.isLoading
    ? 'loading'
    : data
      ? 'ready'
      : 'error';
  const ready = status === 'ready';

  const writer = useSerializedUpdateLimit();
  const { save } = writer;
  const bulkM = useBulkUpdateLimits();

  // null = not known yet (server / hydration) — see `useMediaQuery`.
  const isXl = useMediaQuery('(min-width: 1280px)');
  const isMd = useMediaQuery('(min-width: 768px)');

  // Stable callbacks below read the latest values through refs, so the memoised
  // tiles re-render only when their own props change.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const calendarRef = useRef(calendar);
  calendarRef.current = calendar;

  const tileRefs = useRef(new Map<number, HTMLDivElement>());
  const registerTile = useCallback((isoWeek: number, el: HTMLDivElement | null) => {
    if (el) tileRefs.current.set(isoWeek, el);
    else tileRefs.current.delete(isoWeek);
  }, []);

  // ── Rows ──────────────────────────────────────────────────────────
  const rowsByWeek = useMemo(() => {
    const map = new Map<number, WeeklyLimitDto>();
    for (const row of data ?? []) {
      if (row.isoYear === year) map.set(row.isoWeek, row);
    }
    return map;
  }, [data, year]);
  const rowOf = useCallback(
    (isoWeek: number): WeeklyLimitDto | null => rowsByWeek.get(isoWeek) ?? null,
    [rowsByWeek],
  );

  // Only once the year has loaded — an empty cache would read as "53 weeks
  // unconfigured" and flash the note on every year switch.
  const unconfigured = useMemo(
    () => (data ? unconfiguredWeeks(year, data) : []),
    [data, year],
  );

  // ── Selection ─────────────────────────────────────────────────────
  const select = useCallback(
    (
      weeks: readonly number[],
      opts: { anchor?: number | null; focus?: number | null } = {},
    ) => {
      const normalized = normalizeWeeks(weeks);
      setSelection({
        weeks: normalized,
        anchor: opts.anchor !== undefined ? opts.anchor : (normalized[0] ?? null),
      });
      if (opts.focus !== undefined) setFocusWeek(opts.focus);
      // The bulk form lives only while N > 1 — narrowing drops it unwritten.
      if (normalized.length <= 1) setBulkForm(EMPTY_BULK_FORM);
    },
    [],
  );
  const clearSelection = useCallback(() => {
    select([], { anchor: null });
    setFocusRequest(null);
  }, [select]);

  const changeYear = (next: number): void => {
    if (next === year) return;
    setYear(next);
    select([], { anchor: null, focus: null });
    setFocusRequest(null);
  };

  const announce = (text: string): void =>
    setAnnouncement({ text, nonce: nextNonce() });

  // ── Tile interaction ──────────────────────────────────────────────
  const onTileClick = useCallback(
    (isoWeek: number, mods: TileClickModifiers) => {
      const prev = selectionRef.current;
      if (mods.range) {
        const anchor = prev.anchor ?? isoWeek;
        select(weekRange(anchor, isoWeek), { anchor, focus: isoWeek });
      } else if (mods.toggle) {
        select(toggleWeek(prev.weeks, isoWeek), { anchor: isoWeek, focus: isoWeek });
      } else {
        select([isoWeek], { anchor: isoWeek, focus: isoWeek });
      }
    },
    [select],
  );

  const onTileFocus = useCallback((isoWeek: number) => setFocusWeek(isoWeek), []);

  const onTileKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, isoWeek: number) => {
      const prev = selectionRef.current;
      const mod = event.ctrlKey || event.metaKey;
      let move: GridMove | null = ARROW_MOVES[event.key] ?? null;
      if (event.key === 'Home') move = mod ? 'yearStart' : 'monthStart';
      if (event.key === 'End') move = mod ? 'yearEnd' : 'monthEnd';

      if (move !== null) {
        event.preventDefault();
        const next = moveWeek(calendarRef.current, isoWeek, move);
        tileRefs.current.get(next)?.focus();
        setFocusWeek(next);
        if (event.shiftKey) {
          const anchor = prev.anchor ?? isoWeek;
          select(weekRange(anchor, next), { anchor, focus: next });
        } else if (mod && event.key in ARROW_MOVES) {
          // Ctrl/⌘+arrow moves the focus only — then Ctrl+Space toggles.
        } else {
          // The selection follows the focus (§18.5.3).
          select([next], { anchor: next, focus: next });
        }
        return;
      }

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          if (mod) select(toggleWeek(prev.weeks, isoWeek), { anchor: isoWeek, focus: isoWeek });
          else select([isoWeek], { anchor: isoWeek, focus: isoWeek });
          return;
        case 'Enter':
          event.preventDefault();
          if (!prev.weeks.includes(isoWeek)) {
            select([isoWeek], { anchor: isoWeek, focus: isoWeek });
          }
          setFocusRequest({ target: 'first', nonce: nextNonce() });
          return;
        case 'Escape':
          if (prev.weeks.length > 0) {
            event.preventDefault();
            clearSelection();
          }
          return;
        default:
      }
    },
    [select, clearSelection],
  );

  const selectMonth = useCallback(
    (month: number) => {
      const weeks = calendarRef.current.months[month - 1]?.weeks ?? [];
      select(weeks, { anchor: weeks[0] ?? null, focus: weeks[0] ?? null });
    },
    [select],
  );
  const selectQuarter = useCallback(
    (quarter: number) => {
      const weeks = calendarRef.current.quarters[quarter - 1]?.weeks ?? [];
      select(weeks, { anchor: weeks[0] ?? null, focus: weeks[0] ?? null });
    },
    [select],
  );
  const selectYear = (): void => {
    const weeks = calendar.weeks.map((w) => w.isoWeek);
    select(weeks, { anchor: 1, focus: 1 });
  };
  const selectRange = (from: number, to: number): void => {
    const lo = Math.min(from, to);
    select(weekRange(from, to), { anchor: lo, focus: lo });
  };
  const selectUnconfigured = (): void => {
    select(unconfigured, {
      anchor: unconfigured[0] ?? null,
      focus: unconfigured[0] ?? null,
    });
  };

  // ── «Bieżący tydzień» + scrolling to a requested week ────────────
  const pendingScrollRef = useRef<number | null>(initial.focus);
  const [scrollNonce, setScrollNonce] = useState(0);
  const goToCurrentWeek = (): void => {
    if (year !== current.isoYear) setYear(current.isoYear);
    select([current.isoWeek], { anchor: current.isoWeek, focus: current.isoWeek });
    setFocusRequest(null);
    pendingScrollRef.current = current.isoWeek;
    setScrollNonce((n) => n + 1);
  };
  useEffect(() => {
    const target = pendingScrollRef.current;
    if (target === null || !ready) return;
    const el = tileRefs.current.get(target);
    if (!el) return;
    pendingScrollRef.current = null;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Desktop: keep the keyboard on the grid. Below xl the Sheet takes focus.
    if (isXl) el.focus({ preventScroll: true });
  }, [scrollNonce, ready, year, isXl]);

  // Is the current week's tile on screen? (hides «Bieżący tydzień», §18.4)
  const [currentVisible, setCurrentVisible] = useState(false);
  useEffect(() => {
    if (year !== current.isoYear || !ready) {
      setCurrentVisible(false);
      return;
    }
    const el = tileRefs.current.get(current.isoWeek);
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) =>
      setCurrentVisible(entry?.isIntersecting ?? false),
    );
    io.observe(el);
    return () => io.disconnect();
  }, [year, ready, current]);
  const showCurrentButton = year !== current.isoYear || !currentVisible;

  // ── URL: `?week=` for one selected week, else `?year=` off the current ─
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selection.weeks.length === 1) {
      params.set('week', weekKeyOf(year, selection.weeks[0]!));
      params.delete('year');
    } else {
      params.delete('week');
      if (year !== current.isoYear) params.set('year', String(year));
      else params.delete('year');
    }
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      // Native replaceState — integrates with the App Router without a server
      // round trip per arrow key (a `router.replace` would refetch the page).
      window.history.replaceState(null, '', nextUrl);
    }
  }, [year, selection.weeks, current.isoYear]);

  // Leaving is guarded ONLY while a write is in flight; `unsaved` drafts and
  // a filled bulk form don't block (nothing changed in the DB, §16.3).
  useEffect(() => {
    if (!writer.anyPending) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [writer.anyPending]);

  // ── Single-week writes ────────────────────────────────────────────
  const saveWeek = useCallback(
    async (isoWeek: number, body: UpdateWeeklyLimitDto): Promise<void> => {
      try {
        await save(year, isoWeek, body);
      } catch (error) {
        // Errors only — a success toast per field would mean 159 toasts.
        toast.error(t('saveError'));
        throw error;
      }
    },
    [save, year, t],
  );
  const retryWeek = (isoWeek: number): void => {
    writer.retry(weekKeyOf(year, isoWeek))?.catch(() => toast.error(t('saveError')));
  };

  const onNavigate = (delta: -1 | 1, field: WeekLimitField | null): void => {
    const week = selection.weeks[0];
    if (week === undefined) return;
    const next = week + delta;
    if (next < 1 || next > calendar.lastWeek) {
      // Enter on the last week does not switch the year: stay, and say why.
      if (delta === 1) announce(t('panel.lastWeekOfYear'));
      return;
    }
    select([next], { anchor: next, focus: next });
    setFocusRequest({
      target: field ?? (delta === 1 ? 'next' : 'prev'),
      nonce: nextNonce(),
    });
    tileRefs.current.get(next)?.scrollIntoView({ block: 'nearest' });
  };

  const onReturnToGrid = (): boolean => {
    // Below xl the panel is a modal Sheet: Esc closes it and the Sheet puts
    // the focus back where it was.
    if (isXl === false) return false;
    const week = selection.weeks[0];
    const el = week !== undefined ? tileRefs.current.get(week) : undefined;
    if (!el) return false;
    setFocusWeek(week ?? null);
    el.focus();
    return true;
  };

  // ── Bulk plan (also drives the in-tile preview) ───────────────────
  const isBulk = ready && selection.weeks.length > 1;
  const payloadResult = useMemo(() => buildBulkPayload(bulkForm), [bulkForm]);
  const summary = useMemo(
    () =>
      buildBulkSummary(
        isBulk ? selection.weeks : [],
        (w) => weekValues(rowsByWeek.get(w)),
        payloadResult.ok ? payloadResult.payload : {},
      ),
    [isBulk, selection.weeks, rowsByWeek, payloadResult],
  );
  const previews = useMemo(() => {
    if (!isBulk || !payloadResult.ok) return null;
    const map = new Map<number, WeekTilePreview>();
    for (const row of summary.rows) {
      if (!row.changed) continue;
      const preview: WeekTilePreview = {};
      for (const field of WEEK_LIMIT_FIELDS) {
        if (row[field].changed) preview[field] = row[field];
      }
      map.set(row.isoWeek, preview);
    }
    return map;
  }, [isBulk, payloadResult, summary]);

  const applyBulk = (): void => {
    if (!payloadResult.ok) return;
    const weeks = selection.weeks;
    const parsed = BulkUpdateWeeklyLimitsSchema.safeParse({
      isoYear: year,
      weeks,
      ...payloadResult.payload,
    });
    if (!parsed.success) {
      toast.error(t('saveError'));
      return;
    }
    const first = weeks[0]!;
    bulkM.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(t('bulk.successToast', { count: weeks.length }));
        // Collapse to the first week of the range — the panel goes back to
        // single-week mode.
        select([first], { anchor: first, focus: first });
      },
      onError: () => {
        // Atomic endpoint — nothing was written; the form stays for a retry.
        toast.error(t('saveError'));
      },
    });
  };

  // ── Derived for render ────────────────────────────────────────────
  const selectedSet = useMemo(() => new Set(selection.weeks), [selection.weeks]);
  const currentWeek = year === current.isoYear ? current.isoWeek : null;
  const tabbableWeek = focusWeek ?? selection.weeks[0] ?? currentWeek ?? 1;
  const firstInfo = calendar.weeks[0];
  const lastInfo = calendar.weeks[calendar.weeks.length - 1];

  const isPendingWeek = (isoWeek: number): boolean =>
    writer.isPending(weekKeyOf(year, isoWeek));
  const isFailedWeek = (isoWeek: number): boolean =>
    writer.hasFailed(weekKeyOf(year, isoWeek));

  const dockedHeadingId = useId();
  const sheetHeadingId = useId();

  const panelProps = {
    calendar,
    selected: selection.weeks,
    ready,
    currentWeek,
    todayIso,
    rowOf,
    isPending: isPendingWeek,
    isFailed: isFailedWeek,
    onSaveWeek: saveWeek,
    onRetryWeek: retryWeek,
    onNavigate,
    onReturnToGrid,
    focusRequest,
    onFocusRequestDone: () => setFocusRequest(null),
    onClear: clearSelection,
    onSelectYear: selectYear,
    onSelectRange: selectRange,
    bulk: {
      form: bulkForm,
      onFormChange: setBulkForm,
      payloadResult,
      summary,
      applying: bulkM.isPending,
      onApply: applyBulk,
    },
  };

  const sheetOpen = isXl === false && ready && selection.weeks.length > 0;

  return (
    <section className="px-4 py-8 sm:px-6">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
          <p className="text-sm text-text-sub">{t('isoHint')}</p>
          {firstInfo && lastInfo && (
            <p className="text-sm tabular-nums text-text-sub">
              {t('yearSpan', {
                weeks: tWeek('count', { count: calendar.lastWeek }),
                from: formatDateWithYear(firstInfo.start, locale),
                to: formatDateWithYear(lastInfo.end, locale),
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => changeYear(Math.max(MIN_YEAR, year - 1))}
            disabled={year <= MIN_YEAR}
            aria-label={t('prevYear')}
          >
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <span className="min-w-[4rem] text-center text-xl font-bold tabular-nums text-text">
            {year}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => changeYear(Math.min(maxYear, year + 1))}
            disabled={year >= maxYear}
            aria-label={t('nextYear')}
          >
            <ChevronRight size={16} aria-hidden />
          </Button>
          {/* Kept in the layout (invisible) so the header doesn't jump when
              the current week scrolls in and out of view. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('ml-1', !showCurrentButton && 'invisible')}
            onClick={goToCurrentWeek}
          >
            {t('currentWeek')}
          </Button>
        </div>
      </header>

      {/* ONE page-level note (never 53 tile-level ones): state A is the
          dangerous one — nobody configured the week and it silently pays the
          fallback. The tiles only mark it in amber; the explanation lives
          here, with a way to act on it (§15.5). */}
      {ready && unconfigured.length > 0 && (
        <LockNotice icon={Info} className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span>
              {t('defaultsNotice', {
                count: unconfigured.length,
                kmPerDay: formatKmValue(FALLBACK_KM_PER_DAY),
                rate: formatRateValue(FALLBACK_RATE_PER_KM),
              })}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={selectUnconfigured}>
              {t('defaultsSelect')}
            </Button>
          </div>
        </LockNotice>
      )}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-6">
        <div className="min-w-0">
          <LimitsCalendar
            calendar={calendar}
            rowsByWeek={rowsByWeek}
            status={status}
            errorSlot={
              // Load failure: never render editable weeks — empty tiles would
              // invite overwriting limits that DO exist server-side.
              <ErrorState {...queryErrorProps(limitsQ)} />
            }
            selected={selectedSet}
            tabbableWeek={tabbableWeek}
            currentWeek={currentWeek}
            isPending={isPendingWeek}
            isFailed={isFailedWeek}
            previews={previews}
            onTileClick={onTileClick}
            onTileKeyDown={onTileKeyDown}
            onTileFocus={onTileFocus}
            registerTile={registerTile}
            onSelectMonth={selectMonth}
            onSelectQuarter={selectQuarter}
          />
          {/* Spelled out: switching the weekdays off never touches the
              Saturday guarantee and vice versa (§16.2). */}
          <p className="mt-2 text-xs text-text-sub">{t('independenceHint')}</p>
        </div>

        {isXl !== false && (
          <aside className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
            <WeekEditPanel variant="docked" headingId={dockedHeadingId} {...panelProps} />
          </aside>
        )}
      </div>

      {isXl === false && (
        <Sheet
          open={sheetOpen}
          onOpenChange={(open) => {
            if (!open) clearSelection();
          }}
        >
          <SheetContent
            // Phones: a full-width bottom sheet (§18.10); tablets: right side.
            size={isMd ? 'default' : 'xl'}
            aria-labelledby={sheetHeadingId}
            aria-describedby={undefined}
            className="max-md:top-auto max-md:h-auto max-md:max-h-[85dvh] max-md:rounded-t-xl max-md:border-l-0 max-md:border-t"
          >
            <SheetBody>
              <WeekEditPanel variant="sheet" headingId={sheetHeadingId} {...panelProps} />
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement && <span key={announcement.nonce}>{announcement.text}</span>}
      </p>
    </section>
  );
}
