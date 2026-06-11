'use client';

// Phase 4.3 — `<DashboardView>` client. Owns the TanStack data fetch and
// composes the three rows of the dashboard:
//
//   1. KPI strip (5 tiles)
//   2. Main charts + right rail sidebar
//
// Empty state: when the aggregate `total` is zero, swap charts for a
// friendly empty-state component — drawing zeroed axes is noisier than
// a single message.

import {
  CheckCircle2,
  FileText,
  Hourglass,
  Inbox,
  ShieldQuestion,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDashboard } from '@/lib/hooks/useDashboard';

export function DashboardView() {
  const t = useTranslations('dashboard');
  const { data, isLoading, isError } = useDashboard();

  const kpi = data?.kpi ?? {
    total: 0,
    naWeryfikacji: 0,
    zaakceptowano: 0,
    odrzucono: 0,
    oczekujeNaAutoryzacje: 0,
  };
  const isEmpty = !isLoading && !isError && kpi.total === 0;

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <KpiCard
          label={t('kpi.total')}
          value={kpi.total}
          tone="purple"
          icon={FileText}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.naWeryfikacji')}
          value={kpi.naWeryfikacji}
          tone="blue"
          icon={Hourglass}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.zaakceptowano')}
          value={kpi.zaakceptowano}
          tone="green"
          icon={CheckCircle2}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.odrzucono')}
          value={kpi.odrzucono}
          tone="red"
          icon={XCircle}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.oczekujeNaAutoryzacje')}
          value={kpi.oczekujeNaAutoryzacje}
          tone="orange"
          icon={ShieldQuestion}
          loading={isLoading}
        />
      </div>

      {/* Main + sidebar */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-4">
          {isEmpty ? (
            <div className="rounded-xl border border-border bg-card shadow-card">
              <EmptyState
                icon={Inbox}
                title={t('empty.title')}
                message={t('empty.message')}
              />
            </div>
          ) : (
            <DashboardCharts
              monthlySeries={data?.monthlySeries ?? []}
              kpi={kpi}
            />
          )}
        </div>
        <DashboardSidebar
          overdue={data?.overdue ?? []}
          dueSoon={data?.dueSoon ?? []}
          recent={data?.recent ?? []}
          topCarriers={data?.topCarriers ?? []}
          reklamacjeCount={data?.reklamacje.count ?? 0}
          isLoading={isLoading}
        />
      </div>
    </section>
  );
}
