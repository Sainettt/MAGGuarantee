'use client';

// Phase 12 — carrier «Porozumienie» tab (docs/14 §12.3, status rows REWORKED
// 2026-07-07).
//
// The carrier's home for the guarantee obligation. Three stacked blocks:
//   A. per-vehicle status ROWS — one full-width single column of grouped
//      <Card> sections (Po terminie → Zbliża się → Pod obserwacją → W trasie),
//      each header naming the state (tone + label + count), rows sorted
//      `compareByUrgency`. NO card grid, NO per-row state chip. A calm all-clear
//      line replaces the owed groups when nothing is owed (silence is good).
//   B. a static, info-toned explainer of the porozumienie rules.
//   C. the durable episode history (one combined feed, plate per row).
//
// Data: `useMyGuaranteeCompliance` (rows — shares the strip/badge cache) +
// `useMyGuaranteeEpisodes` (history, cursor-paged). Both live under
// `GUARANTEE_KEY`, so reporting a wyjazd refreshes every block at once.

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Info,
  type LucideIcon,
  Truck,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { GuaranteeComplianceItem } from '@magguarantee/shared';

import { GuaranteeEpisodeHistory } from '@/components/guarantee/GuaranteeEpisodeHistory';
import { GuaranteeStatusRow } from '@/components/guarantee/GuaranteeStatusRow';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  compareByUrgency,
  type GuaranteeCardGroup,
  guaranteeCardGroup,
} from '@/lib/guarantee';
import {
  useMyGuaranteeCompliance,
  useMyGuaranteeEpisodes,
} from '@/lib/hooks/useGuarantee';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import { cn } from '@/lib/utils';

const GROUP_ORDER: readonly GuaranteeCardGroup[] = [
  'violated',
  'dueSoon',
  'watched',
  'okActive',
];

// Group-section header meta — the ONLY place the state is named (§12.3.2). The
// count `<Badge>` reuses the board's pill treatment (border + tinted text on a
// transparent fill); zero new tokens.
const GROUP_META: Record<
  GuaranteeCardGroup,
  { icon: LucideIcon; text: string; pill: string }
> = {
  violated: { icon: AlertTriangle, text: 'text-danger', pill: 'border-danger/40 text-danger' },
  dueSoon: { icon: Clock, text: 'text-warning', pill: 'border-warning/40 text-warning' },
  watched: { icon: Eye, text: 'text-text-sub', pill: 'border-border text-text-sub' },
  okActive: { icon: Truck, text: 'text-success', pill: 'border-success/40 text-success' },
};

export default function CarrierPorozumieniePage() {
  const t = useTranslations('guarantee.porozumienie');
  const tExplainer = useTranslations('guarantee.porozumienie.explainer');
  const tHistory = useTranslations('guarantee.episodes');

  const complianceQ = useMyGuaranteeCompliance();
  const episodesQ = useMyGuaranteeEpisodes();

  // Partition into the four card groups (`inactive` dropped), each sorted
  // worst-first. One pass — the group is derived once via `guaranteeCardGroup`.
  const groups = useMemo(() => {
    const buckets: Record<GuaranteeCardGroup, GuaranteeComplianceItem[]> = {
      violated: [],
      dueSoon: [],
      watched: [],
      okActive: [],
    };
    for (const item of complianceQ.data?.items ?? []) {
      const g = guaranteeCardGroup(item);
      if (g) buckets[g].push(item);
    }
    for (const g of GROUP_ORDER) buckets[g].sort(compareByUrgency);
    return buckets;
  }, [complianceQ.data]);

  const episodes = useMemo(
    () => episodesQ.data?.pages.flatMap((p) => p.items) ?? [],
    [episodesQ.data],
  );

  const nothingOwed =
    groups.violated.length === 0 && groups.dueSoon.length === 0;

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-text">
        {t('title')}
      </h1>

      {/* ── Block A — per-vehicle status rows (full-width, grouped) ── */}
      {complianceQ.isLoading ? (
        <div className="space-y-4">
          <GroupSkeleton />
          <GroupSkeleton />
        </div>
      ) : complianceQ.isError && !complianceQ.data ? (
        // Never fall through to the calm all-clear line on a failed load.
        <div className="rounded-xl border border-border bg-card shadow-card">
          <ErrorState {...queryErrorProps(complianceQ)} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Calm all-clear line when neither owed group has rows. */}
          {nothingOwed ? (
            <div className="rounded-xl border border-border bg-card shadow-card px-4 py-6">
              <p className="flex items-center justify-center gap-2 text-sm text-text-sub">
                <CheckCircle2 size={16} className="text-success" aria-hidden />
                {t('allClear')}
              </p>
            </div>
          ) : null}

          {GROUP_ORDER.map((g) => {
            const items = groups[g];
            if (items.length === 0) return null;
            const meta = GROUP_META[g];
            const Icon = meta.icon;
            return (
              <section
                key={g}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-card"
              >
                {/* Group header — the ONLY place the state is named. */}
                <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <Icon size={16} className={cn('shrink-0', meta.text)} aria-hidden />
                  <span
                    className={cn(
                      'text-xs font-bold uppercase tracking-wide',
                      meta.text,
                    )}
                  >
                    {t(`group.${g}`)}
                  </span>
                  <Badge
                    variant="muted"
                    className={cn('ml-auto border bg-transparent', meta.pill)}
                  >
                    {items.length}
                  </Badge>
                </header>
                {/* Rows — divided, full-width, one per vehicle. */}
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <GuaranteeStatusRow
                      key={item.vehicleId}
                      item={item}
                      group={g}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* ── Block B — static explainer (calm, info-toned, NOT warning) ── */}
      <div className="rounded-[10px] border border-border bg-info-soft px-4 py-3 dark:bg-sky-950/40">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-text-sub" aria-hidden />
          <div>
            <h2 className="text-sm font-bold text-text">
              {tExplainer('title')}
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-text-sub list-disc pl-4">
              <li>{tExplainer('obligation')}</li>
              <li>{tExplainer('reminders')}</li>
              <li>{tExplainer('silence')}</li>
              <li>{tExplainer('restart')}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Block C — episode history (one combined feed, plate per row) ── */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-sub">
          {tHistory('title')}
        </h2>
        <GuaranteeEpisodeHistory
          items={episodes}
          isLoading={episodesQ.isLoading}
          {...queryErrorProps(episodesQ)}
          isFetchingMore={episodesQ.isFetchingNextPage}
          hasMore={Boolean(episodesQ.hasNextPage)}
          onLoadMore={() => episodesQ.fetchNextPage()}
        />
      </div>
    </section>
  );
}

/** Per-group loading placeholder — mirrors the section shape, never blocks. */
function GroupSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Skeleton className="h-4 w-40" />
      </header>
      <ul className="divide-y divide-border">
        {[0, 1].map((i) => (
          <li key={i} className="px-4 py-3">
            <Skeleton className="h-10 w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}
