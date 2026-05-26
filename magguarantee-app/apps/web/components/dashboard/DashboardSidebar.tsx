'use client';

// Phase 4.3 — right-rail `<DashboardSidebar>` per docs/14 L737. Hosts four
// sections (urgent / recent / topCarriers / reklamacje), each with its own
// loading + empty fallback, stacked vertically. On `<lg` widths it falls
// underneath the main content as a single column (responsive contract from
// DS L756).

import { AlertTriangle, BellRing, History, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type {
  DashboardAuditRowSummary,
  DashboardClaimSummary,
  DashboardTopCarrier,
} from '@magguarantee/shared';

import { AuditRowCompact } from '@/components/audit/AuditRow';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatEur } from '@/lib/format/numbers';
import { cn } from '@/lib/utils';

interface DashboardSidebarProps {
  urgent: DashboardClaimSummary[];
  recent: DashboardAuditRowSummary[];
  topCarriers: DashboardTopCarrier[];
  reklamacjeCount: number;
  isLoading: boolean;
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon size={14} className="text-text-sub" aria-hidden />
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {title}
        </h2>
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function SidebarSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-8 w-full" />
        </li>
      ))}
    </ul>
  );
}

export function DashboardSidebar({
  urgent,
  recent,
  topCarriers,
  reklamacjeCount,
  isLoading,
}: DashboardSidebarProps) {
  const t = useTranslations('dashboard.sidebar');
  // Status lookups via the root namespace + `.has` guard: backend can grow
  // new ClaimStatus values without next-intl throwing on a missing key here.
  const tRoot = useTranslations();

  return (
    <aside className="w-full lg:w-[380px] lg:shrink-0 space-y-4">
      <SectionCard title={t('urgent')} icon={AlertTriangle}>
        {isLoading ? (
          <SidebarSkeleton />
        ) : urgent.length === 0 ? (
          <p className="px-1 py-2 text-sm text-text-sub">{t('urgentEmpty')}</p>
        ) : (
          <ul className="space-y-1">
            {urgent.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/employee/claims?nrZgl=${encodeURIComponent(c.nrZgl)}`}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    'hover:bg-input transition-colors',
                    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
                  )}
                >
                  <span className="font-mono text-xs text-text">
                    {c.nrZgl}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-text-sub">
                    {c.carrierName ?? '—'}
                  </span>
                  <span className="shrink-0 text-xs text-text-sub">
                    {tRoot.has(`carrier.claims.status.${c.status}`)
                      ? tRoot(`carrier.claims.status.${c.status}`)
                      : c.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t('recent')} icon={History}>
        {isLoading ? (
          <SidebarSkeleton />
        ) : recent.length === 0 ? (
          <p className="px-1 py-2 text-sm text-text-sub">{t('recentEmpty')}</p>
        ) : (
          <ul className="-mx-1">
            {recent.map((r) => (
              <AuditRowCompact key={r.id} row={r} />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t('topCarriers')} icon={Trophy}>
        {isLoading ? (
          <SidebarSkeleton />
        ) : topCarriers.length === 0 ? (
          <p className="px-1 py-2 text-sm text-text-sub">
            {t('topCarriersEmpty')}
          </p>
        ) : (
          <ol className="space-y-1">
            {topCarriers.map((c, idx) => (
              <li
                key={c.carrierId}
                className="flex items-center gap-2 px-2 py-1.5 text-sm"
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-input text-[10px] font-bold text-text-sub">
                  {idx + 1}
                </span>
                <span className="flex-1 min-w-0 truncate font-semibold text-text">
                  {c.name ?? c.login}
                </span>
                <span className="shrink-0 text-xs text-text-sub tabular-nums">
                  {formatEur(c.totalEur)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <SectionCard title={t('reklamacje')} icon={BellRing}>
        {isLoading ? (
          <Skeleton className="h-12 w-24" />
        ) : (
          <div className="flex items-baseline gap-2 px-1">
            <span className="text-3xl font-bold text-text tabular-nums">
              {reklamacjeCount}
            </span>
            <span className="text-sm text-text-sub">
              {t('reklamacjeUnit')}
            </span>
          </div>
        )}
      </SectionCard>
    </aside>
  );
}
