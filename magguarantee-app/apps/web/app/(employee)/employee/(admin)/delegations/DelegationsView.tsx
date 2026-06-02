'use client';

// Phase 6.x — admin all-access "Wyjazdy" view.
//
// Admin is all-access on `GET /delegations` (no server-side scope), so this
// list is unbounded — hence a light filter bar + cursor pagination (mirrors
// the audit-log page, Phase 4.5). The presentation is the SHARED
// <DelegationsTable> (same columns + clickable row → read-only
// <DelegationDetailModal>) that planista / dyspozytor / carrier already see.
//
// Filter bar maps to existing `DelegationFilters` fields:
//   • status   — <Select> over the four DelegationStatus values,
//   • q         — free-text substring (carrier login/name/plate; no carrier
//                 autocomplete is wired in the web app yet — see report), and
//   • from/to   — date-range pair. The API filter is typed `IsoDateTime`, so a
//                 `YYYY-MM-DD` <input type="date"> value is widened to a full
//                 ISO datetime (from → start-of-day, to → end-of-day).
//
// Default = show everything (no pre-filter). Strictly read-only — a row opens
// a VIEW modal; there are no mutation controls (status changes are a
// weryfikator concern, Phase 7).

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type {
  DelegationFilters,
  DelegationStatus,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DelegationsTable } from '@/components/delegations/DelegationsTable';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useDelegations } from '@/lib/hooks/useDelegations';

const STATUSES: readonly DelegationStatus[] = [
  'zgloszony',
  'w_trasie',
  'zjechal',
  'anulowany',
];

/** Widen a `YYYY-MM-DD` date-input value to a full ISO datetime. The API's
 *  `from`/`to` filters are `IsoDateTime`; we anchor `from` at start-of-day and
 *  `to` at end-of-day so an inclusive single-day range still matches. */
function toIsoStart(date: string): string | undefined {
  return date ? `${date}T00:00:00.000Z` : undefined;
}
function toIsoEnd(date: string): string | undefined {
  return date ? `${date}T23:59:59.999Z` : undefined;
}

export function DelegationsView() {
  const t = useTranslations('delegations.admin');
  const tStatus = useTranslations('carrier.delegations.status');
  const tCommon = useTranslations('common');
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
        namespace="delegations.admin.table"
        loadingLabel={tCommon('loading')}
        rowAriaLabel={(r) =>
          tA11y('showDelegationDetails', {
            name: r.vehicle?.plateNumber ?? '—',
          })
        }
      />

      {(data?.nextCursor || cursorStack.length > 0) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={prevPage}
            disabled={cursorStack.length === 0}
          >
            ←
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={nextPage}
            disabled={!data?.nextCursor}
          >
            →
          </Button>
        </div>
      )}
    </section>
  );
}
