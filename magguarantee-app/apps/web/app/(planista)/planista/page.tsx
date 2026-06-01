'use client';

// Phase 6.4 — planista read-only fleet panel.
//
// The route-group `layout.tsx` already does `requireRoleAccess(['admin',
// 'planista'])` + wraps in `<RoleShell>`, so this page does NOT re-guard. It is
// a strictly read-only inspection surface (DS §6.3.2): a heading + a
// non-dismissible read-only banner + a 3-tab `<Tabs>` over the shared read-only
// fleet sub-tables. No KPI strip (that is the dyspozytor variant).
//
// Backed by `GET /fleet/planista` (`usePlanistaFleet`) — three slim lists in
// one payload, scoped server-side by the planista's JWT identity.

import { useTranslations } from 'next-intl';

import {
  FleetDriversTable,
  FleetTrailersTable,
  FleetVehiclesTable,
} from '@/components/fleet/FleetTables';
import { ReadOnlyBanner } from '@/components/fleet/ReadOnlyBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { usePlanistaFleet } from '@/lib/hooks/usePlanistaFleet';

export default function PlanistaPanelPage() {
  const t = useTranslations('planista');
  const { data, isLoading } = usePlanistaFleet();

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="text-sm text-text-sub">{t('subtitle')}</p>
      </div>

      <ReadOnlyBanner message={t('readOnlyBanner')} />

      <Tabs defaultValue="vehicles" className="w-full">
        <TabsList aria-label={t('tabs.ariaLabel')} className="mb-4">
          <TabsTrigger value="vehicles">{t('tabs.vehicles')}</TabsTrigger>
          <TabsTrigger value="drivers">{t('tabs.drivers')}</TabsTrigger>
          <TabsTrigger value="trailers">{t('tabs.trailers')}</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles">
          <FleetVehiclesTable
            rows={data?.vehicles ?? []}
            isLoading={isLoading}
            namespace="planista.vehicles"
          />
        </TabsContent>

        <TabsContent value="drivers">
          <FleetDriversTable
            rows={data?.drivers ?? []}
            isLoading={isLoading}
            namespace="planista.drivers"
          />
        </TabsContent>

        <TabsContent value="trailers">
          <FleetTrailersTable
            rows={data?.trailers ?? []}
            isLoading={isLoading}
            namespace="planista.trailers"
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
