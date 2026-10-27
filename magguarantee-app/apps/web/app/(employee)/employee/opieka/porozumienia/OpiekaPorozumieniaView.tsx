'use client';

// Phase 12 — opiekun & admin watchdog board route (docs/14 §12.4).
//
// The «Porozumienia» tab of the opieka surface. Lives at a dedicated route
// (not an in-page tab-panel) so it's deep-linkable and back-button friendly;
// the shared <OpiekaTabsNav> strip lights the active tab off the pathname.
//
// One <GuaranteeComplianceBoard> for both roles — the API scopes the rows
// (admin → all carriers; opiekun → only supervised carriers), so there is no
// role branching here. This is the client view of the route; the route's own
// `page.tsx` (same directory) gates it server-side with
// `requirePermission('panel.opiekun', { onDenied: 'forbidden' })`, mirrored at
// the edge by the `/employee/opieka` rule (`PATH_PERMISSIONS` in
// `lib/roles.ts`), so a pracownik gets «Brak dostępu» instead of the board's
// error state (UWAGI #17).

import { useTranslations } from 'next-intl';

import { GuaranteeComplianceBoard } from '@/components/guarantee/GuaranteeComplianceBoard';
import { OpiekaTabsNav } from '@/components/opieka/OpiekaTabsNav';

export default function OpiekaPorozumieniaView() {
  const t = useTranslations('guarantee.board');

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="text-sm text-text-sub">{t('subtitle')}</p>
      </div>

      <OpiekaTabsNav />

      <GuaranteeComplianceBoard />
    </section>
  );
}
