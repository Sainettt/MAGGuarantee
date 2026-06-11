'use client';

// Phase 4.3 / 7.6 — right-rail `<DashboardSidebar>` per docs/14 L737. Hosts
// the verification-SLA «attention» buckets (overdue / dueSoon, §7.6) at the
// top, then recent / topCarriers / reklamacje, each with its own loading +
// empty fallback, stacked vertically. On `<lg` widths it falls underneath the
// main content as a single column (responsive contract from DS L756).

import { BellRing, CheckCircle2, History, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  DashboardAuditRowSummary,
  DashboardSlaClaim,
  DashboardTopCarrier,
} from '@magguarantee/shared';

import { AuditRowCompact } from '@/components/audit/AuditRow';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatEur } from '@/lib/format/numbers';

import { SlaAttentionSection } from './SlaAttentionSection';

interface DashboardSidebarProps {
  overdue: DashboardSlaClaim[];
  dueSoon: DashboardSlaClaim[];
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

// §7.6.2 loading rule: the SLA buckets get their own independent skeleton
// (3 rows) so the whole sidebar doesn't block on the dashboard fetch.
function SlaSkeleton() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card p-3">
      <ul className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="h-9 w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

// §7.6.2 both-empty rule: one calm «all-clear» card — neutral surface, success
// check, muted copy. This is the good state, NOT an alarming empty shell.
function SlaAllClearCard({ message }: { message: string }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-2 px-4 py-4">
        <CheckCircle2 size={16} className="text-success" aria-hidden />
        <p className="text-sm text-text-sub">{message}</p>
      </div>
    </section>
  );
}

export function DashboardSidebar({
  overdue,
  dueSoon,
  recent,
  topCarriers,
  reklamacjeCount,
  isLoading,
}: DashboardSidebarProps) {
  const t = useTranslations('dashboard.sidebar');
  const tSla = useTranslations('dashboard.sla');

  const noAttention = overdue.length === 0 && dueSoon.length === 0;

  return (
    <aside className="w-full lg:w-[380px] lg:shrink-0 space-y-4">
      {/* §7.6 verification-SLA attention buckets: overdue above dueSoon,
          empty buckets omitted, both-empty → one calm all-clear card. */}
      {isLoading ? (
        <SlaSkeleton />
      ) : noAttention ? (
        <SlaAllClearCard message={tSla('allClear')} />
      ) : (
        <>
          {overdue.length > 0 ? (
            <SlaAttentionSection severity="overdue" claims={overdue} />
          ) : null}
          {dueSoon.length > 0 ? (
            <SlaAttentionSection severity="dueSoon" claims={dueSoon} />
          ) : null}
        </>
      )}

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
