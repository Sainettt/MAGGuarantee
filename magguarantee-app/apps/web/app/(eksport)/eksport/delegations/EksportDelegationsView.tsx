'use client';

// Phase 7 — eksport read-only delegations board (docs/14-design-system.md §7).
//
// The eksport role is a strictly read-only витрина: a status filter + a
// «historia» toggle (drives `includeHistory`) and the SHARED read-only
// <DelegationsTable> (auto / driver / route / period / status, row-click → the
// read-only <DelegationDetailModal>). There are NO mutation controls anywhere
// — that is weryfikator territory. The table reuse means this page is the
// Phase 6.3 read-only panel pattern verbatim.
//
// History toggle off (default) → API returns only ACTIVE statuses (zgloszony +
// w_trasie). On → all statuses incl. zjechal / anulowany. An explicit status
// filter still narrows on top.

import { Gauge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type {
  DelegationFilters,
  DelegationStatus,
} from '@magguarantee/shared';

import { DelegationsBoardFilters } from '@/components/delegations/DelegationsBoardFilters';
import { DelegationsTable } from '@/components/delegations/DelegationsTable';
import { useDelegations } from '@/lib/hooks/useDelegations';

export function EksportDelegationsView() {
  const t = useTranslations('eksport.delegations');
  const tCommon = useTranslations('common');
  const tA11y = useTranslations('fleet.a11y');
  const tKm = useTranslations('weryfikator.km');

  const [status, setStatus] = useState<DelegationStatus | ''>('');
  const [includeHistory, setIncludeHistory] = useState(false);

  const filters: DelegationFilters = useMemo(
    () => ({
      limit: 50,
      status: status || undefined,
      // Only thread the flag when on — `undefined` is dropped from the query
      // so the API default (active-only) applies.
      includeHistory: includeHistory || undefined,
    }),
    [status, includeHistory],
  );

  const { data, isLoading } = useDelegations(filters);

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
        </div>
        <Link
          href="/eksport/km"
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-[10px] border border-border bg-transparent px-3 text-[13px] font-bold text-text transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
        >
          <Gauge size={15} aria-hidden="true" />
          {tKm('title.report')}
        </Link>
      </header>

      <div
        className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-text-sub"
        role="note"
      >
        {t('readOnlyBanner')}
      </div>

      <DelegationsBoardFilters
        namespace="eksport.delegations"
        status={status}
        onStatusChange={setStatus}
        includeHistory={includeHistory}
        onIncludeHistoryChange={setIncludeHistory}
      />

      <DelegationsTable
        rows={data?.items ?? []}
        isLoading={isLoading}
        namespace="eksport.delegations.table"
        loadingLabel={tCommon('loading')}
        rowAriaLabel={(r) =>
          tA11y('showDelegationDetails', {
            name: r.vehicle?.plateNumber ?? '—',
          })
        }
      />
    </section>
  );
}
