'use client';

// Phase 4 — client view for `/employee/claims`. Owns filter / pagination
// / modal-open state; delegates rendering to `<ClaimsTable>` and
// `<ClaimVerificationModal>`.
//
// Pagination: cursor-based per `docs/13-api-design.md:54`. We keep a
// stack of cursors so the user can step forward (next) and back (the
// previous cursor we pushed). Simpler than maintaining a full page-cache
// and matches the API contract.

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { ClaimListItem, ClaimStatus } from '@magguarantee/shared';

import { ClaimVerificationModal } from '@/components/claims/ClaimVerificationModal';
import { ClaimsTable } from '@/components/claims/ClaimsTable';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useClaims } from '@/lib/hooks/useClaims';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

const ALL_STATUSES: ClaimStatus[] = [
  'NA_WERYFIKACJI',
  'ZAAKCEPTOWANO',
  'ODRZUCONO',
  'REKLAMACJA',
  'OCZEKUJE_NA_AUTORYZACJE',
  'AUTORYZACJA_KWOTA_MAKSIMA',
];

export function ClaimsListView() {
  const t = useTranslations('employee.claims');
  const tStatus = useTranslations('carrier.claims.status');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClaimStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const debouncedSearch = useDebouncedValue(search, 250);

  const filters = useMemo(
    () => ({
      limit: 50,
      q: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
      status: (status || undefined) as ClaimStatus | undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      cursor,
    }),
    [debouncedSearch, status, dateFrom, dateTo, cursor],
  );

  const { data, isLoading } = useClaims(filters);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedNrZgl, setSelectedNrZgl] = useState<string | null>(null);

  const openRow = (row: ClaimListItem) => {
    setSelectedNrZgl(row.nrZgl);
    setModalOpen(true);
  };

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
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
      </div>

      {/* Filter bar — sticky-ish, the page itself is scrollable. */}
      <div className="flex flex-wrap gap-3 mb-4 p-3 border border-border bg-input rounded-lg">
        <Input
          type="search"
          className="h-10 sm:max-w-xs flex-1 min-w-[200px]"
          placeholder={t('filters.searchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetCursor();
          }}
        />
        <Select
          className="h-10 sm:max-w-xs flex-1 min-w-[160px]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ClaimStatus | '');
            resetCursor();
          }}
          aria-label={t('filters.status')}
        >
          <option value="">{t('filters.allStatuses')}</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          className="h-10 sm:max-w-[10rem]"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            resetCursor();
          }}
          aria-label={t('filters.dateFrom')}
        />
        <Input
          type="date"
          className="h-10 sm:max-w-[10rem]"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            resetCursor();
          }}
          aria-label={t('filters.dateTo')}
        />
      </div>

      <ClaimsTable
        rows={data?.items ?? []}
        isLoading={isLoading}
        onRowClick={openRow}
      />

      {/* Pagination — only render when meaningful */}
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

      <ClaimVerificationModal
        open={modalOpen}
        nrZgl={selectedNrZgl}
        onClose={() => setModalOpen(false)}
      />
    </section>
  );
}
