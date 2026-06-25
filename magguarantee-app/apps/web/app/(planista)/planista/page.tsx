'use client';

// Phase 6.4 — planista read-only fleet panel.
//
// The route-group `layout.tsx` already does `requireRoleAccess(['admin',
// 'planista'])` + wraps in `<RoleShell>`, so this page does NOT re-guard.
//
// TEMPORARY PARITY (product-owner decision): the planista panel is functionally
// IDENTICAL to the dyspozytor panel — same KPI strip + "stojące > 7 dni"
// highlight + 4-tab Auta/Wyjazdy/Kierowcy/Naczepy surface, rendered by the
// shared <FleetPanel>. The two roles WILL diverge later; the shared component
// is a convenience, not a contract.
//
// `usePlanistaFleet()` now returns `stats` + `stojaceList` (same shapes as
// dyspozytor). The Wyjazdy tab is fed by `useDelegations()` with NO params —
// `GET /delegations` now auto-scopes for planista by `plannerId` server-side,
// exactly like dyspozytor.
//
// Backed by `GET /fleet/planista` (`usePlanistaFleet`).

import { useTranslations } from 'next-intl';

import { FleetPanel } from '@/components/fleet/FleetPanel';
import { useDelegations } from '@/lib/hooks/useDelegations';
import { usePlanistaFleet } from '@/lib/hooks/usePlanistaFleet';

export default function PlanistaPanelPage() {
  const t = useTranslations('planista');
  const { data, isLoading } = usePlanistaFleet();
  // No params — the API auto-scopes delegations to the planista's vehicles
  // (by plannerId), exactly like the dyspozytor panel.
  const delegationsQ = useDelegations({ limit: 50 });

  return (
    <FleetPanel
      title={t('title')}
      subtitle={t('subtitle')}
      readOnlyBanner={t('readOnlyBanner')}
      namespace="planista"
      data={data}
      isLoading={isLoading}
      delegations={delegationsQ.data?.items ?? []}
      delegationsLoading={delegationsQ.isLoading}
      myKmHref="/planista/moje-pojazdy"
    />
  );
}
