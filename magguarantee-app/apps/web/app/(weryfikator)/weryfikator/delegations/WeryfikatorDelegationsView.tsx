'use client';

// Phase 7 — weryfikator delegations board (docs/14-design-system.md §7).
//
// Same Phase 6.3 read-only panel pattern as eksport (status filter + «historia»
// toggle) but with the <WeryfikatorDelegationsTable> that adds the trailing
// per-row `actions` column (exactly two status-advancing actions, no cancel).
// No read-only banner here — this role acts on the board.

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type {
  DelegationFilters,
  DelegationStatus,
} from '@magguarantee/shared';

import { DelegationsBoardFilters } from '@/components/delegations/DelegationsBoardFilters';
import { WeryfikatorDelegationsTable } from '@/components/delegations/WeryfikatorDelegationsTable';
import { useDelegations } from '@/lib/hooks/useDelegations';

export function WeryfikatorDelegationsView() {
  const t = useTranslations('weryfikator.delegations');

  const [status, setStatus] = useState<DelegationStatus | ''>('');
  const [includeHistory, setIncludeHistory] = useState(false);

  const filters: DelegationFilters = useMemo(
    () => ({
      limit: 50,
      status: status || undefined,
      includeHistory: includeHistory || undefined,
    }),
    [status, includeHistory],
  );

  const { data, isLoading } = useDelegations(filters);

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
      </header>

      <DelegationsBoardFilters
        namespace="weryfikator.delegations"
        status={status}
        onStatusChange={setStatus}
        includeHistory={includeHistory}
        onIncludeHistoryChange={setIncludeHistory}
      />

      <WeryfikatorDelegationsTable
        rows={data?.items ?? []}
        isLoading={isLoading}
      />
    </section>
  );
}
