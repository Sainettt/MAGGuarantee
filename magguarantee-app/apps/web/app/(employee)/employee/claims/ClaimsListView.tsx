'use client';

// Phase 7.1 — client view for `/employee/claims`. Owns filter / pagination /
// modal-open state; delegates rendering to `<ClaimsTable>` and the unified
// `<ClaimModal>` (the verification surface, docs/14 §6.5).
//
// Pagination: cursor-based per `docs/13-api-design.md:54`. We keep a stack
// of cursors so the user can step forward (next) and back (the previous
// cursor we pushed). Simpler than maintaining a full page-cache and matches
// the API contract.
//
// Phase 7.1 — single-surface claim flow (replaces the Phase 4.6 two-step
// detail→edit handoff):
//   row click  → <ClaimModal> opens in `view` (read-only)
//   «Edycja»   → morphs the SAME modal to `edit` in place (no re-mount)
//   close      → back to list
// One `modalOpen` boolean + `selectedNrZgl` drive the modal; the view↔edit
// morph lives INSIDE <ClaimModal>, so the list no longer tracks an edit
// sub-state. `canEdit` (admin|pracownik) controls the «Edycja» affordance;
// read-only roles get the modal in `view` with no edit button.
//
// Phase 4.6 — `?nrZgl=<...>` deeplink. The dashboard sidebar's "Urgent"
// links jump straight to this page with the claim pre-selected. We read the
// param ONCE on mount and clear it on close so:
//   - the back button returns to the dashboard rather than re-opening the
//     same modal,
//   - a refresh on /employee/claims with no param doesn't auto-open
//     anything (the param has already been wiped).

import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClaimListItem, ClaimStatus } from '@magguarantee/shared';

import { ClaimModal } from '@/components/claims/ClaimModal';
import { ClaimsTable } from '@/components/claims/ClaimsTable';
import { CursorPager } from '@/components/ui/CursorPager';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/lib/hooks/useAuth';
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

  const router = useRouter();
  const searchParams = useSearchParams();

  const { user } = useAuth();
  // Phase 7.1 — admin + pracownik may edit; opiekun / others see the unified
  // modal in `view` without an «Edycja» button. Passed into <ClaimModal> so
  // the modal stays role-agnostic.
  const canEdit = user?.role === 'admin' || user?.role === 'pracownik';

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

  // ── Deeplink reader (mount-only) ────────────────────────────────────
  // We deliberately consume `?nrZgl=` exactly once. After that we strip the
  // param via `router.replace` so:
  //   1. A history "back" returns to the previous page (dashboard) rather
  //      than re-opening the same modal on this URL.
  //   2. A refresh on the bare `/employee/claims` URL doesn't accidentally
  //      re-open whatever was last selected (the param is already gone).
  // The `consumedRef` guard prevents a re-fire if `searchParams` identity
  // changes for any other reason (route-group remount, Suspense reflow).
  const consumedRef = useRef(false);
  useEffect(() => {
    if (consumedRef.current) return;
    const deeplinkNrZgl = searchParams.get('nrZgl');
    if (deeplinkNrZgl && deeplinkNrZgl.trim().length > 0) {
      setSelectedNrZgl(deeplinkNrZgl);
      setModalOpen(true);
      // Strip the param without a server roundtrip; `scroll: false` keeps
      // the scroll position pinned where the user was.
      router.replace('/employee/claims', { scroll: false });
    }
    consumedRef.current = true;
    // We only run this once — depending on `searchParams` would re-trigger
    // on the very `router.replace` we just fired, so the deps are pinned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Row click → open the unified modal in `view` ────────────────────
  // `setSelectedNrZgl` overwrites whatever stale value the previous
  // close-without-clear left behind; the view↔edit morph then happens
  // inside <ClaimModal>, so the list doesn't track an edit sub-state.
  const openRow = (row: ClaimListItem) => {
    setSelectedNrZgl(row.nrZgl);
    setModalOpen(true);
  };

  // ── Close handler ───────────────────────────────────────────────────
  // We deliberately leave `selectedNrZgl` populated so a re-open of the
  // same row hits the useClaim cache without a fresh fetch — TanStack
  // already keys by nrZgl, so this just preserves the cache pointer.
  const onModalClose = () => {
    setModalOpen(false);
  };

  const resetCursor = () => {
    setCursor(undefined);
    setCursorStack([]);
  };

  const hasActiveFilters = Boolean(
    debouncedSearch.length >= 2 || status || dateFrom || dateTo,
  );

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
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
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      {/* Pagination — only render when meaningful */}
      {(data?.nextCursor || cursorStack.length > 0) && (
        <CursorPager
          onPrev={prevPage}
          onNext={nextPage}
          canPrev={cursorStack.length > 0}
          canNext={Boolean(data?.nextCursor)}
        />
      )}

      {/* Unified verification modal (docs/14 §6.5) — opens in `view` on a
          plain row click; «Edycja» morphs the same surface to `edit` in
          place. `canEdit` gates the «Edycja» affordance for read-only
          roles, which see the modal read-only. */}
      <ClaimModal
        open={modalOpen}
        nrZgl={selectedNrZgl}
        initialMode="view"
        canEdit={canEdit}
        onClose={onModalClose}
      />
    </section>
  );
}
