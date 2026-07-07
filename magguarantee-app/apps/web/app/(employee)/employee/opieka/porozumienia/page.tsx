'use client';

// Phase 12 — opiekun & admin watchdog board route (docs/14 §12.4).
//
// The «Porozumienia» tab of the opieka surface. Lives at a dedicated route
// (not an in-page tab-panel) so it's deep-linkable and back-button friendly;
// the shared <OpiekaTabsNav> strip lights the active tab off the pathname.
//
// One <GuaranteeComplianceBoard> for both roles — the API scopes the rows
// (admin → all carriers; opiekun → only supervised carriers), so there is no
// role branching here. Page-level role gating is inherited from
// `(employee)/layout.tsx` (admin + pracownik + opiekun); pracownik has no nav
// entry and would see the board's own error/empty state if they typed the URL
// (the API returns 403 for them).

import { useTranslations } from 'next-intl';

import { GuaranteeComplianceBoard } from '@/components/guarantee/GuaranteeComplianceBoard';
import { OpiekaTabsNav } from '@/components/opieka/OpiekaTabsNav';

export default function OpiekaPorozumieniaPage() {
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
