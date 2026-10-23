'use client';

// docs/14 §17.5 — <PlannerTransferList>: the requests inbox (`decider`: admin
// all, a planista lider his planisci's) and «my requests» (`author`: opiekun,
// planista). One component, four hosts:
//
//   /employee/przekazania   admin → decider (+ «Moje wnioski») · opiekun → author
//   /planista/przekazania   author (planista, with the «Przekaż ciągnik» CTA)
//   /planista/zatwierdzenia decider (planista lider)
//
// In-page tabs (§17.5.1): «Do decyzji» / «Oczekujące» (status=pending, oldest
// first — a queue) and «Rozpatrzone» (decided, newest first, status filter +
// cursor pagination). The admin inbox has a third tab «Moje wnioski»
// (`withMineTab`, §17.5.8): his own requests (`scope=mine`) as AUTHOR cards
// (cancel on pending), ONE status select instead of nested tabs, one query,
// one pager. The default tab is always the first one, even when empty. Cards,
// not a table (D7): the free text is the point.
//
// Filters + pagers live HERE, not in the tab panels: <TabsContent> unmounts
// inactive panels, and a filter must survive switching tabs within the visit
// (§17.5.8). The inactive tabs' queries are disabled, not dropped — so a
// mutation's prefix invalidation (`PLANNER_TRANSFERS_KEY`, §17.9) marks them
// stale and they refetch when their tab is opened again.
//
// The pending tab of the decider shares its query with the nav counter
// (`DECIDE_PENDING_PARAMS`), so the badge and the tab count cannot disagree;
// both count only `viewerCanDecide` rows (an admin's own request excluded).

import { ArrowLeftRight, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import type { PlannerTransferDto } from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { CursorPager } from '@/components/ui/CursorPager';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import {
  DECIDED_PAGE_LIMIT,
  PENDING_PAGE_LIMIT,
  usePlannerTransfers,
} from '@/lib/hooks/usePlannerTransfers';
import type { PlannerTransferListParams } from '@/lib/api/plannerTransfers';
import { useAuth } from '@/lib/hooks/useAuth';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import {
  DEFAULT_DECIDED_FILTER,
  DEFAULT_MINE_FILTER,
  MINE_FILTERS,
  mineEmptyKind,
  mineFilterLabelKey,
  parseDecidedFilter,
  parseMineFilter,
  parseTransferTab,
  type DecidedFilter,
  type MineFilter,
  type TransferTab,
} from '@/lib/transfers/transferListFilters';
import { decidableCount, personName } from '@/lib/transfers/transferUi';
import { cn } from '@/lib/utils';

import { ApproveTransferDialog } from './ApproveTransferDialog';
import { CancelTransferDialog } from './CancelTransferDialog';
import { PlannerHistoryDialog } from './PlannerHistoryDialog';
import { PlannerTransferRequestDialog } from './PlannerTransferRequestDialog';
import { RejectTransferDialog } from './RejectTransferDialog';
import { TransferRequestCard } from './TransferRequestCard';

export interface PlannerTransferListProps {
  mode: 'decider' | 'author';
  /** Page `h1`. */
  title: string;
  subtitle: string;
  /** Author list of a planista: the «Przekaż ciągnik» CTA (+ empty-state action). */
  canRequest?: boolean;
  /** Which «no pending requests» explanation the author gets. */
  authorVariant?: 'planista' | 'opiekun';
  /** Admin inbox — «Lider planisty: …» on every decider card. */
  showLeader?: boolean;
  /**
   * Admin inbox (`mode="decider"`) — the third tab «Moje wnioski»: his own
   * requests (`scope=mine`) with a status filter (§17.5.8). No counter.
   */
  withMineTab?: boolean;
  /** Page container classes (the two shells differ, §17.5). */
  className?: string;
}

/** Forward/back cursor stack (the api is cursor-paginated, docs/13). */
function useCursorStack() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [stack, setStack] = useState<(string | undefined)[]>([]);
  return {
    cursor,
    canPrev: stack.length > 0,
    next: (nextCursor: string | null | undefined) => {
      if (!nextCursor) return;
      setStack((s) => [...s, cursor]);
      setCursor(nextCursor);
    },
    prev: () => {
      setStack((s) => {
        if (s.length === 0) return s;
        const copy = [...s];
        setCursor(copy.pop());
        return copy;
      });
    },
    reset: () => {
      setCursor(undefined);
      setStack([]);
    },
  };
}

/** In-page tab triggers keep one line; the tablist scrolls instead. */
const TAB_CLASS = 'shrink-0 whitespace-nowrap';

/** The `bg-input` filter bar above a list (§Surface policy; W14 `bg-card` select). */
function StatusFilterBar({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-input p-3">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <Select
        id={id}
        className={cn('h-10 min-w-[160px] flex-1 bg-card sm:max-w-[14rem]')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </Select>
    </div>
  );
}

function CardSkeletons() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex flex-col gap-2 rounded-xl border border-border p-5"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-72" />
          <Skeleton className="h-12 w-full" />
        </li>
      ))}
    </ul>
  );
}

export default function PlannerTransferList({
  mode,
  title,
  subtitle,
  canRequest = false,
  authorVariant = 'planista',
  showLeader = false,
  withMineTab = false,
  className,
}: PlannerTransferListProps) {
  const t = useTranslations('transfers');
  const { user } = useAuth();
  const scope = mode === 'decider' ? 'decide' : 'mine';
  const hasMineTab = withMineTab && mode === 'decider';

  const [tab, setTab] = useState<TransferTab>('pending');
  const [decidedFilter, setDecidedFilter] = useState<DecidedFilter>(
    DEFAULT_DECIDED_FILTER,
  );
  const [mineFilter, setMineFilter] = useState<MineFilter>(DEFAULT_MINE_FILTER);
  const pendingPager = useCursorStack();
  const decidedPager = useCursorStack();
  const minePager = useCursorStack();

  const pendingParams: PlannerTransferListParams = {
    scope,
    status: 'pending',
    limit: PENDING_PAGE_LIMIT,
    cursor: pendingPager.cursor,
  };
  const pendingQ = usePlannerTransfers(pendingParams, {
    // Same freshness as the nav counter it shares the cache with (§17.4.3).
    refetchOnWindowFocus: mode === 'decider',
  });
  const decidedQ = usePlannerTransfers(
    {
      scope,
      status: decidedFilter,
      limit: DECIDED_PAGE_LIMIT,
      cursor: decidedPager.cursor,
    },
    { enabled: tab === 'decided' },
  );
  // «Moje wnioski» (§17.5.8): the filter IS the api `status` — one query, one
  // pager. The pending queue gets the same one-page-of-200 as «Do decyzji».
  const mineQ = usePlannerTransfers(
    {
      scope: 'mine',
      status: mineFilter,
      limit: mineFilter === 'pending' ? PENDING_PAGE_LIMIT : DECIDED_PAGE_LIMIT,
      cursor: minePager.cursor,
    },
    { enabled: hasMineTab && tab === 'mine' },
  );

  // ── Dialog targets ───────────────────────────────────────────────────
  const [approveTarget, setApproveTarget] = useState<PlannerTransferDto | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PlannerTransferDto | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PlannerTransferDto | null>(null);
  const [historyTarget, setHistoryTarget] = useState<PlannerTransferDto | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const pendingCount =
    mode === 'decider' && pendingQ.data ? decidableCount(pendingQ.data.items) : 0;

  const requestCta = (
    <Button size="sm" onClick={() => setRequestOpen(true)}>
      <ArrowLeftRight size={14} aria-hidden="true" />
      {t('request.buttonPlanista')}
    </Button>
  );

  // «Moje wnioski» are the admin's OWN requests: author cards (cancel on
  // pending, no <LockNotice> — «you can't decide your own» is the norm there).
  const renderCards = (
    items: PlannerTransferDto[],
    cardMode: 'decider' | 'author',
  ) => (
    <ul className="flex flex-col gap-3">
      {items.map((tr) => (
        <li key={tr.id}>
          <TransferRequestCard
            transfer={tr}
            mode={cardMode}
            viewerRole={user?.role}
            showLeader={showLeader && cardMode === 'decider'}
            onApprove={setApproveTarget}
            onReject={setRejectTarget}
            onCancel={setCancelTarget}
            onShowHistory={setHistoryTarget}
          />
        </li>
      ))}
    </ul>
  );

  const renderBody = (
    q: typeof pendingQ,
    empty: ReactNode,
    pager: ReturnType<typeof useCursorStack>,
    cardMode: 'decider' | 'author' = mode,
  ) => {
    if (q.isLoading) return <CardSkeletons />;
    if (q.isError && !q.data) {
      return (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <ErrorState {...queryErrorProps(q)} />
        </div>
      );
    }
    const items = q.data?.items ?? [];
    return (
      <>
        {items.length === 0 ? empty : renderCards(items, cardMode)}
        {(q.data?.nextCursor || pager.canPrev) && (
          <CursorPager
            onPrev={pager.prev}
            onNext={() => pager.next(q.data?.nextCursor)}
            canPrev={pager.canPrev}
            canNext={Boolean(q.data?.nextCursor)}
          />
        )}
      </>
    );
  };

  const pendingEmpty =
    mode === 'decider' ? (
      <EmptyState
        icon={ArrowLeftRight}
        title={t('empty.pendingDecider.title')}
        message={t('empty.pendingDecider.message')}
      />
    ) : (
      <EmptyState
        icon={ArrowLeftRight}
        title={t('empty.pendingAuthor.title')}
        message={
          authorVariant === 'planista'
            ? t('empty.pendingAuthor.messagePlanista')
            : t('empty.pendingAuthor.messageOpiekun')
        }
        action={canRequest ? requestCta : undefined}
      />
    );

  const decidedFiltered = decidedFilter !== 'decided';
  const decidedEmpty = decidedFiltered ? (
    <EmptyState
      icon={ArrowLeftRight}
      title={t('empty.decidedFiltered.title')}
      message={t('empty.decidedFiltered.message')}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDecidedFilter(DEFAULT_DECIDED_FILTER);
            decidedPager.reset();
          }}
        >
          {t('empty.decidedFiltered.action')}
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={ArrowLeftRight}
      title={t('empty.decided.title')}
      message={t('empty.decided.message')}
    />
  );

  // «Moje wnioski» empty states (§17.5.8) — all reused keys. The «pending»
  // text is role-neutral: «you file it in the vehicle edit form» (D9).
  const mineEmptyByKind = {
    pendingAuthor: (
      <EmptyState
        icon={ArrowLeftRight}
        title={t('empty.pendingAuthor.title')}
        message={t('empty.pendingAuthor.messageOpiekun')}
      />
    ),
    decided: (
      <EmptyState
        icon={ArrowLeftRight}
        title={t('empty.decided.title')}
        message={t('empty.decided.message')}
      />
    ),
    decidedFiltered: (
      <EmptyState
        icon={ArrowLeftRight}
        title={t('empty.decidedFiltered.title')}
        message={t('empty.decidedFiltered.message')}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setMineFilter(DEFAULT_MINE_FILTER);
              minePager.reset();
            }}
          >
            {t('empty.decidedFiltered.action')}
          </Button>
        }
      />
    ),
  } satisfies Record<ReturnType<typeof mineEmptyKind>, ReactNode>;

  return (
    <section className={className}>
      {/* Page header — §6.3.1 p.1 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {title}
          </h1>
          <p className="text-sm text-text-sub">{subtitle}</p>
        </div>
        {canRequest ? <div className="self-start">{requestCta}</div> : null}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(parseTransferTab(v, hasMineTab))}>
        {/* Three PL labels overflow 360px: scroll, never wrap (W6 recipe). */}
        <TabsList aria-label={t('tabs.ariaLabel')} className="mb-4 overflow-x-auto">
          <TabsTrigger value="pending" className={TAB_CLASS}>
            {mode === 'decider' ? t('tabs.pendingDecider') : t('tabs.pendingAuthor')}
            {pendingCount > 0 ? (
              <span className="ml-1 tabular-nums">({pendingCount})</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="decided" className={TAB_CLASS}>
            {t('tabs.decided')}
          </TabsTrigger>
          {hasMineTab ? (
            // No counter: author lists never have one (§17.4.1).
            <TabsTrigger value="mine" className={TAB_CLASS}>
              {t('tabs.mine')}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="pending">
          {renderBody(pendingQ, pendingEmpty, pendingPager)}
        </TabsContent>

        <TabsContent value="decided">
          <StatusFilterBar
            id="transfers-status-filter"
            label={t('filter.status')}
            value={decidedFilter}
            onChange={(v) => {
              setDecidedFilter(parseDecidedFilter(v));
              decidedPager.reset();
            }}
          >
            <option value="decided">{t('filter.all')}</option>
            <option value="approved">{t('filter.approved')}</option>
            <option value="rejected">{t('filter.rejected')}</option>
            <option value="cancelled">{t('filter.cancelled')}</option>
          </StatusFilterBar>
          {renderBody(decidedQ, decidedEmpty, decidedPager)}
        </TabsContent>

        {hasMineTab ? (
          <TabsContent value="mine">
            {/* ONE select, no nested tabs — a second tab bar under the first
                would read as one navigation (§17.5.8). */}
            <StatusFilterBar
              id="transfers-mine-status-filter"
              label={t('filter.status')}
              value={mineFilter}
              onChange={(v) => {
                setMineFilter(parseMineFilter(v));
                minePager.reset();
              }}
            >
              {MINE_FILTERS.map((f) => (
                <option key={f} value={f}>
                  {t(mineFilterLabelKey(f))}
                </option>
              ))}
            </StatusFilterBar>
            {renderBody(
              mineQ,
              mineEmptyByKind[mineEmptyKind(mineFilter)],
              minePager,
              'author',
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      <ApproveTransferDialog
        transfer={approveTarget}
        onOpenChange={(o) => {
          if (!o) setApproveTarget(null);
        }}
      />
      <RejectTransferDialog
        transfer={rejectTarget}
        onOpenChange={(o) => {
          if (!o) setRejectTarget(null);
        }}
      />
      <CancelTransferDialog
        transfer={cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
      />
      <PlannerHistoryDialog
        target={
          historyTarget
            ? {
                vehicleId: historyTarget.vehicle.id,
                plate: historyTarget.vehicle.plateNumber,
                carrierName: historyTarget.vehicle.carrier
                  ? personName(historyTarget.vehicle.carrier)
                  : null,
              }
            : null
        }
        onOpenChange={(o) => {
          if (!o) setHistoryTarget(null);
        }}
      />
      {canRequest ? (
        <PlannerTransferRequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
      ) : null}
    </section>
  );
}

/** «Sekcja dla liderów planistów» — a non-lider on the approvals route (no API call). */
export function NotLiderNotice({ className }: { className?: string }) {
  const t = useTranslations('transfers.empty.notLider');
  return (
    <div className={className}>
      <EmptyState icon={Lock} title={t('title')} message={t('message')} />
    </div>
  );
}

export { PlannerTransferList };
