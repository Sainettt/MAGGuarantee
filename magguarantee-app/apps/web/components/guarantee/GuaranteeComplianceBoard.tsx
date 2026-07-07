'use client';

// Phase 12 — opiekun & admin compliance board (docs/14 §12.4).
//
// A full-width board of guaranteed vehicles that need a zgłoszenie-wyjazdu,
// grouped into severity sections (Po terminie → Zbliża się termin → Pod
// obserwacją), most-urgent-first. Reuses the §7.6.2 attention-section shape
// (card shell + tinted left-border rows + worded countdown chip). Above the
// sections: a 3-tile KPI strip (§Phase 5.2 pattern) + a filter row.
//
// ONE component for both roles — the API scopes rows server-side (admin → all
// carriers; opiekun → only their supervised carriers), so there is NO role
// branching here. It renders whatever `GET /guarantee-compliance` returns.
//
// `inactive` / `ok_active` vehicles are not owed and are filtered out entirely
// (they surface only in the per-carrier fleet views). When nothing is owed
// across every in-scope carrier, the whole board collapses to one calm
// all-clear card — the good state, never an empty red/amber shell.
//
// Rows deep-link to the carrier drill-down «Porozumienia» tab
// (`/employee/opieka/carriers/[login]?tab=porozumienia&vehicleId=…`). The board
// item carries `carrier.id` (UUID); the human-readable `login` for the URL is
// resolved client-side from the cached `/fleet/opiekun` response — the same
// resolution the drill-down page itself uses.

import { AlertTriangle, CheckCircle2, Clock, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { GuaranteeComplianceItem } from '@magguarantee/shared';

import { GuaranteeCountdownBadge } from '@/components/carrier/GuaranteeCountdownBadge';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateFull } from '@/lib/format/numbers';
import { compareByUrgency, watchdogSeverity } from '@/lib/guarantee';
import { useGuaranteeCompliance } from '@/lib/hooks/useGuarantee';
import { useOpiekunFleet } from '@/lib/hooks/useOpiekunFleet';
import { cn } from '@/lib/utils';

/** Filter-select state values (`''` = all). */
type StateFilter = '' | 'violated' | 'dueSoon' | 'watched';

export function GuaranteeComplianceBoard() {
  const t = useTranslations('guarantee.board');
  const tCommon = useTranslations('common');
  const { data, isLoading } = useGuaranteeCompliance();

  // login lookup (carrierId → login) for the drill-down deep-link. Shares the
  // opiekun-fleet cache; when cold it fetches once. A missing login falls back
  // to the carrierId so the link never breaks.
  const fleetQ = useOpiekunFleet();
  const loginById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of fleetQ.data?.carriers ?? []) map.set(c.carrierId, c.login);
    return map;
  }, [fleetQ.data]);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('');

  // Partition owed rows into the three §12.0 buckets. `inactive`/`ok_active`
  // never appear. Search matches plate OR carrier name.
  const { violated, dueSoon, watched } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (i: GuaranteeComplianceItem) =>
      q.length < 2 ||
      i.plateNumber.toLowerCase().includes(q) ||
      (i.carrier?.name ?? '').toLowerCase().includes(q);

    const v: GuaranteeComplianceItem[] = [];
    const d: GuaranteeComplianceItem[] = [];
    const w: GuaranteeComplianceItem[] = [];
    for (const item of data?.items ?? []) {
      if (!matches(item)) continue;
      const sev = watchdogSeverity(item);
      if (sev === 'violated') v.push(item);
      else if (sev === 'dueSoon') d.push(item);
      else if (sev === 'calm') w.push(item);
    }
    v.sort(compareByUrgency);
    d.sort(compareByUrgency);
    w.sort(compareByUrgency);
    return { violated: v, dueSoon: d, watched: w };
  }, [data, search]);

  // KPI counts come from the server summary when unfiltered; otherwise reflect
  // the filtered view so the tiles agree with what's on screen.
  const summary = data?.summary;
  const kpiViolated = search ? violated.length : (summary?.violated ?? 0);
  const kpiDueSoon = search ? dueSoon.length : (summary?.dueSoon ?? 0);
  // `watched` KPI = counting-with-room only (the muted section), not the whole
  // `summary.watched` (which counts every guaranteed vehicle incl. ok_active).
  const kpiWatched = watched.length;

  const [showWatched, setShowWatched] = useState(false);

  const showViolated = stateFilter === '' || stateFilter === 'violated';
  const showDueSoon = stateFilter === '' || stateFilter === 'dueSoon';
  const showWatchedSection =
    (stateFilter === '' && showWatched) || stateFilter === 'watched';

  const hasAnyOwed =
    violated.length > 0 || dueSoon.length > 0 || watched.length > 0;
  const hasActiveFilters = search.trim().length >= 2 || stateFilter !== '';

  const anchorLine = (item: GuaranteeComplianceItem): string => {
    const parts: string[] = [];
    if (item.carrier?.name) parts.push(item.carrier.name);
    if (item.anchorAt) {
      const key =
        item.anchorSource === 'agreement' ? 'anchor.agreement' : 'anchor.zjechal';
      parts.push(t(key, { date: formatDateFull(item.anchorAt) }));
    }
    return parts.join(' · ');
  };

  const rowHref = (item: GuaranteeComplianceItem): string => {
    const login = item.carrier ? loginById.get(item.carrier.id) : undefined;
    const seg = encodeURIComponent(login ?? item.carrier?.id ?? '');
    return `/employee/opieka/carriers/${seg}?tab=porozumienia&vehicleId=${item.vehicleId}`;
  };

  return (
    <div className="space-y-6">
      {/* KPI strip — the shape of the problem at a glance. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label={t('kpi.violated')}
          value={kpiViolated}
          tone="red"
          icon={AlertTriangle}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.dueSoon')}
          value={kpiDueSoon}
          tone="orange"
          icon={Clock}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.watched')}
          value={kpiWatched}
          tone="neutral"
          loading={isLoading}
        />
      </div>

      {/* Filter row — search + state select. */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="search"
          className="h-10 sm:max-w-sm"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="sm:max-w-xs"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          aria-label={t('filterState')}
        >
          <option value="">{t('stateAll')}</option>
          <option value="violated">{t('sectionViolated')}</option>
          <option value="dueSoon">{t('sectionDueSoon')}</option>
          <option value="watched">{t('sectionWatched')}</option>
        </Select>
      </div>

      {/* Loading — per-section skeletons, don't block the whole board. */}
      {isLoading ? (
        <div className="space-y-4">
          <BoardSectionSkeleton />
          <BoardSectionSkeleton />
        </div>
      ) : !hasAnyOwed && !hasActiveFilters ? (
        // Nothing owed across every in-scope carrier → one calm all-clear card.
        <div className="rounded-xl border border-border bg-card shadow-card px-4 py-6">
          <p className="flex items-center justify-center gap-2 text-sm text-text-sub">
            <CheckCircle2 size={16} className="text-success" aria-hidden />
            {t('allClear')}
          </p>
        </div>
      ) : violated.length === 0 &&
        dueSoon.length === 0 &&
        watched.length === 0 ? (
        // A filter/search that matched nothing — distinct from all-clear.
        <EmptyState
          icon={SearchX}
          title={t('emptyFilteredTitle')}
          message={t('emptyFilteredMessage')}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setStateFilter('');
              }}
            >
              {tCommon('clearFilters')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {showViolated && violated.length > 0 ? (
            <BoardSection
              severity="violated"
              title={t('sectionViolated')}
              items={violated}
              anchorLine={anchorLine}
              rowHref={rowHref}
            />
          ) : null}

          {showDueSoon && dueSoon.length > 0 ? (
            <BoardSection
              severity="dueSoon"
              title={t('sectionDueSoon')}
              items={dueSoon}
              anchorLine={anchorLine}
              rowHref={rowHref}
            />
          ) : null}

          {/* «Pod obserwacją» — muted, opt-in when unfiltered so the board
              stays focused on problems. */}
          {watched.length > 0 && stateFilter === '' && !showWatched ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowWatched(true)}
              >
                {t('showAllWatched')} ({watched.length})
              </Button>
            </div>
          ) : null}

          {showWatchedSection && watched.length > 0 ? (
            <BoardSection
              severity="watched"
              title={t('sectionWatched')}
              items={watched}
              anchorLine={anchorLine}
              rowHref={rowHref}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Severity section (mirrors <SlaAttentionSection>) ───────

type SectionSeverity = 'violated' | 'dueSoon' | 'watched';

const SECTION = {
  violated: {
    icon: AlertTriangle,
    card: 'border-danger/30',
    headerText: 'text-danger',
    pill: 'border-danger/40 text-danger',
    row: cn(
      'border-l-2 border-danger bg-danger-bg/40 dark:bg-danger/10',
      'hover:bg-danger-bg/70 dark:hover:bg-danger/15',
      'focus-visible:ring-danger',
    ),
  },
  dueSoon: {
    icon: Clock,
    card: 'border-warning/30',
    headerText: 'text-warning',
    pill: 'border-warning/40 text-warning',
    row: cn(
      'border-l-2 border-warning bg-warning-bg/40 dark:bg-warning/10',
      'hover:bg-warning-bg/70 dark:hover:bg-warning/15',
      'focus-visible:ring-warning',
    ),
  },
  watched: {
    icon: Clock,
    card: 'border-border',
    headerText: 'text-text-sub',
    pill: 'border-border text-text-sub',
    row: cn(
      'border-l-2 border-border bg-input/50 dark:bg-input/40',
      'hover:bg-input dark:hover:bg-input',
      'focus-visible:ring-brand',
    ),
  },
} as const;

interface BoardSectionProps {
  severity: SectionSeverity;
  title: string;
  items: GuaranteeComplianceItem[];
  anchorLine: (item: GuaranteeComplianceItem) => string;
  rowHref: (item: GuaranteeComplianceItem) => string;
}

function BoardSection({
  severity,
  title,
  items,
  anchorLine,
  rowHref,
}: BoardSectionProps) {
  const t = useTranslations('guarantee.board');
  const s = SECTION[severity];
  const Icon = s.icon;

  return (
    <section className={cn('rounded-xl border bg-card shadow-card', s.card)}>
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon size={14} className={s.headerText} aria-hidden />
        <h2
          className={cn(
            'flex-1 text-sm font-bold uppercase tracking-wider',
            s.headerText,
          )}
        >
          {title}
        </h2>
        <Badge variant="muted" className={cn('border bg-transparent', s.pill)}>
          {items.length}
        </Badge>
      </header>
      <div className="p-3">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.vehicleId}>
              <Link
                href={rowHref(item)}
                aria-label={`${item.plateNumber} · ${anchorLine(item)}`}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-2',
                  'cursor-pointer transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset',
                  s.row,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <span className="font-mono font-semibold text-text">
                      {item.plateNumber}
                    </span>{' '}
                    <span className="text-xs text-text-sub">
                      · {item.sideNumber ?? '—'}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-text-sub tabular-nums">
                    {anchorLine(item)}
                    {item.deadlineAt
                      ? ` · ${t('deadline', {
                          date: formatDateFull(item.deadlineAt),
                        })}`
                      : ''}
                  </span>
                </span>
                <GuaranteeCountdownBadge daysLeft={item.daysLeft ?? 0} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BoardSectionSkeleton() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Skeleton className="h-4 w-40" />
      </header>
      <div className="p-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </section>
  );
}
