'use client';

// Opiekun «Wyjazdy» — every outing of the carriers this opiekun supervises.
//
// Same presentation contract as the admin all-access view: the shared
// <DelegationsTable> (identical columns + row-click → read-only
// <DelegationDetailModal>, docs/14 §6.4.1) with a light filter bar and cursor
// pagination on top. The ONLY difference is scope, and scope is a server
// concern — we never send `carrierId`, the API narrows `GET /delegations` to
// the carriers whose `opiekunId` is the caller.
//
// Read-only end to end (docs/03-roles.md#opiekun): no status-transition
// controls, no mutations; the detail modal footer is «Zamknij»-only (§6.6).
//
// Filter bar maps onto existing `DelegationFilters` fields (status / q /
// from / to) exactly as the admin view does; `from`/`to` are `IsoDateTime` in
// the contract, so a `YYYY-MM-DD` <input type="date"> value is widened to
// start-of-day / end-of-day so an inclusive single-day range still matches.

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { DelegationFilters, DelegationStatus } from '@magguarantee/shared';

import { DelegationsTable } from '@/components/delegations/DelegationsTable';
import { CursorPager } from '@/components/ui/CursorPager';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useDelegations } from '@/lib/hooks/useDelegations';

const STATUSES: readonly DelegationStatus[] = [
  'zgloszony',
  'w_trasie',
  'zjechal',
  'anulowany',
];

function toIsoStart(date: string): string | undefined {
  return date ? `${date}T00:00:00.000Z` : undefined;
}
function toIsoEnd(date: string): string | undefined {
  return date ? `${date}T23:59:59.999Z` : undefined;
}

export function OpiekunDelegationsView() {
  const t = useTranslations('delegations.opiekun');
  const tStatus = useTranslations('carrier.delegations.status');
  const tA11y = useTranslations('fleet.a11y');

  const [status, setStatus] = useState<DelegationStatus | ''>('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const debouncedQ = useDebouncedValue(q, 300);

  const filters: DelegationFilters = useMemo(
    () => ({
      limit: 50,
      status: status || undefined,
      q: debouncedQ.trim().length >= 1 ? debouncedQ.trim() : undefined,
      from: toIsoStart(from),
      to: toIsoEnd(to),
      cursor,
    }),
    [status, debouncedQ, from, to, cursor],
  );

  const { data, isLoading } = useDelegations(filters);

  const resetCursor = () => {
    setCursor(undefined);
    setCursorStack([]);
  };

  const hasActiveFilters = Boolean(
    status || debouncedQ.trim().length >= 1 || from || to,
  );

  const clearFilters = () => {
    setStatus('');
    setQ('');
    setFrom('');
    setTo('');
    resetCursor();
  };

  const nextPage = () => {
    if (!data?.nextCursor) return;
    setCursorStack((s) => [...s, cursor ?? '']);
    setCursor(data.nextCursor);
  };
  const prevPage = () => {
    setCursorStack((s) => {
      if (s.length === 0) return s;
      const next = [...s];
      const prev = next.pop();
      setCursor(prev || undefined);
      return next;
    });
  };

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
      </header>

      <div className="flex flex-wrap gap-3 mb-4 p-3 border border-border bg-input rounded-lg">
        <Select
          className="h-10 sm:max-w-[12rem] flex-1 min-w-[160px]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DelegationStatus | '');
            resetCursor();
          }}
          aria-label={t('filters.status')}
        >
          <option value="">{t('filters.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </Select>
        <Input
          type="search"
          className="h-10 sm:max-w-[16rem] flex-1 min-w-[180px]"
          placeholder={t('filters.searchPlaceholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            resetCursor();
          }}
          aria-label={t('filters.search')}
        />
        <Input
          type="date"
          className="h-10 sm:max-w-[10rem]"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            resetCursor();
          }}
          aria-label={t('filters.dateFrom')}
        />
        <Input
          type="date"
          className="h-10 sm:max-w-[10rem]"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            resetCursor();
          }}
          aria-label={t('filters.dateTo')}
        />
      </div>

      <DelegationsTable
        rows={data?.items ?? []}
        isLoading={isLoading}
        namespace="delegations.opiekun.table"
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        rowAriaLabel={(r) =>
          tA11y('showDelegationDetails', {
            name: r.vehicle?.plateNumber ?? '—',
          })
        }
      />

      {(data?.nextCursor || cursorStack.length > 0) && (
        <CursorPager
          onPrev={prevPage}
          onNext={nextPage}
          canPrev={cursorStack.length > 0}
          canNext={Boolean(data?.nextCursor)}
        />
      )}
    </section>
  );
}
