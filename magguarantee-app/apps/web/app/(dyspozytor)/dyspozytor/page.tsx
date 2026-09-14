'use client';

// Phase 6.5 / 6.4 — dyspozytor read-only fleet panel.
//
// The route-group `layout.tsx` already does `requireRoleAccess(['admin',
// 'dyspozytor'])` + wraps in `<RoleShell>`, so this page does NOT re-guard.
//
// The whole panel body lives in the shared <FleetPanel> (KPI strip +
// "stojące > 7 dni" highlight + 4-tab Auta/Wyjazdy/Kierowcy/Naczepy with
// clickable rows opening read-only detail modals). The Wyjazdy tab is fed by
// `useDelegations()` with NO params — the API auto-scopes the list to the
// dispatcher's own vehicles server-side from the JWT identity.
//
// Backed by `GET /fleet/dyspozytor` (`useDyspozytorFleet`).

import { useTranslations } from 'next-intl';

import { FleetPanel } from '@/components/fleet/FleetPanel';
import { useDelegations } from '@/lib/hooks/useDelegations';
import { useDyspozytorFleet } from '@/lib/hooks/useDyspozytorFleet';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

export default function DyspozytorPanelPage() {
  const t = useTranslations('dyspozytor');
  const fleetQ = useDyspozytorFleet();
  const { data, isLoading } = fleetQ;
  // No params — the API auto-scopes delegations to the dispatcher's vehicles.
  const delegationsQ = useDelegations({ limit: 50 });

  return (
    <FleetPanel
      title={t('title')}
      subtitle={t('subtitle')}
      readOnlyBanner={t('readOnlyBanner')}
      namespace="dyspozytor"
      data={data}
      isLoading={isLoading}
      delegations={delegationsQ.data?.items ?? []}
      delegationsLoading={delegationsQ.isLoading}
      fleetError={queryErrorProps(fleetQ)}
      delegationsError={queryErrorProps(delegationsQ)}
      myKmHref="/dyspozytor/moje-pojazdy"
    />
  );
}
