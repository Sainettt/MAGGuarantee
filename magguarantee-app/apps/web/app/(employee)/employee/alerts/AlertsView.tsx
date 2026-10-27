'use client';

// Phase 5.2 — «Alerty»: document-expiry alerts, in-app only.
//
// A dedicated top-level page (admin + opiekun) that surfaces every carrier /
// vehicle / driver document whose expiry is within a week — or already past —
// grouped into three zones and topped with a per-severity summary strip.
//
// This is the client view of the route; the route's own `page.tsx` (same
// directory) gates it server-side with `requirePermission('panel.opiekun',
// { onDenied: 'forbidden' })` — the permission of the nav entry — and the
// edge mirrors the rule (`PATH_PERMISSIONS` in `lib/roles.ts`), so a stray
// direct-URL visitor gets «Brak dostępu», not an error state (UWAGI #17). The
// classification is computed server-side against today, so this page is
// always current on load (no cron, no stale badge).

import { CircleCheckBig } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AlertGroupCard } from '@/components/alerts/AlertGroupCard';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAlerts } from '@/lib/hooks/useAlerts';

export default function AlertsView() {
  const t = useTranslations('alerts');
  const { data, isLoading, isError } = useAlerts();

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-sub">
          {t('subtitle', { days: data?.meta.warnDays ?? 7 })}
        </p>
      </header>

      {/* Per-severity summary strip. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t('kpi.expired')}
          value={data?.meta.totals.expired ?? (isLoading ? 0 : 0)}
          tone="red"
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.today')}
          value={data?.meta.totals.critical ?? 0}
          tone="red"
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.warning')}
          value={data?.meta.totals.warning ?? 0}
          tone="orange"
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.upcoming')}
          value={data?.meta.totals.upcoming ?? 0}
          tone="blue"
          loading={isLoading}
        />
      </div>

      {isLoading && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <EmptyState title={t('error.title')} message={t('error.message')} />
      )}

      {data && !isLoading && data.groups.length === 0 && (
        <EmptyState
          icon={CircleCheckBig}
          iconClassName="text-success"
          title={t('empty.title')}
          message={t('empty.message')}
        />
      )}

      {data && data.groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {data.groups.map((group) => (
            <AlertGroupCard key={group.category} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
