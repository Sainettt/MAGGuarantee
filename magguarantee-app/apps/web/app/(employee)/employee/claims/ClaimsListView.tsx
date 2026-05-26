'use client';

// Phase 4 — client view for `/employee/claims`. Owns filter / pagination /
// modal-open state; delegates rendering to `<ClaimsTable>`, the read-only
// `<ClaimDetailModal>` and the editing `<ClaimVerificationModal>`.
//
// Pagination: cursor-based per `docs/13-api-design.md:54`. We keep a stack
// of cursors so the user can step forward (next) and back (the previous
// cursor we pushed). Simpler than maintaining a full page-cache and matches
// the API contract.
//
// Phase 4.6 — two-step claim opening flow (mirrors /employee/vehicles and
// /employee/trailers):
//   row click  → detail modal (read-only)
//   «Edytuj»  → verification modal (existing edit form)
//   close     → back to list
// A single `view` state machine (`null | 'detail' | 'edit'`) keeps the two
// surfaces mutually exclusive — the verification modal opens on a clean
// stack, never on top of the detail modal.
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

import { ClaimDetailModal } from '@/components/claims/ClaimDetailModal';
import { ClaimVerificationModal } from '@/components/claims/ClaimVerificationModal';
import { ClaimsTable } from '@/components/claims/ClaimsTable';
import { Button } from '@/components/ui/Button';
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

/**
 * Two-step claim modal state machine — see file header. `null` keeps both
 * modals closed (the default list view); `'detail'` shows the read-only
 * surface; `'edit'` swaps to the verification form. Switching `'detail' →
 * 'edit'` preserves `selectedNrZgl` so the edit modal lands on the same
 * claim the user was just inspecting.
 */
type ViewMode = null | 'detail' | 'edit';

export function ClaimsListView() {
  const t = useTranslations('employee.claims');
  const tStatus = useTranslations('carrier.claims.status');

  const router = useRouter();
  const searchParams = useSearchParams();

  const { user } = useAuth();
  // Phase 4.6 — admin + pracownik may edit; opiekun / others see the detail
  // modal without an «Edytuj» button. Computed once per render; passed into
  // ClaimDetailModal as an optional callback so the modal itself stays
  // role-agnostic.
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

  const [view, setView] = useState<ViewMode>(null);
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
      setView('detail');
      // Strip the param without a server roundtrip; `scroll: false` keeps
      // the scroll position pinned where the user was.
      router.replace('/employee/claims', { scroll: false });
    }
    consumedRef.current = true;
    // We only run this once — depending on `searchParams` would re-trigger
    // on the very `router.replace` we just fired, so the deps are pinned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Row click → open detail modal ───────────────────────────────────
  // `setSelectedNrZgl` overwrites whatever stale value the previous
  // close-without-clear left behind; see the close handlers below for why
  // we deliberately don't wipe nrZgl on close.
  const openRow = (row: ClaimListItem) => {
    setSelectedNrZgl(row.nrZgl);
    setView('detail');
  };

  // ── Detail → edit transition ────────────────────────────────────────
  // <EntityDetailModal>'s «Edytuj» implementation invokes `onOpenChange(false)`
  // FIRST and then `onEdit?.()` — both in the same micro-task. The close
  // therefore fires BEFORE `goToEdit` runs, so we can't simultaneously wipe
  // `selectedNrZgl` in the detail-close handler AND have it readable here.
  //
  // We resolve this by leaving `selectedNrZgl` alive on close (it's harmless
  // stale state — neither modal renders unless `view !== null`, and the
  // next `openRow` overwrites it anyway). `goToEdit` just flips the view;
  // the edit modal mounts on the same nrZgl that fed the detail surface.
  const goToEdit = () => {
    setView('edit');
  };

  // ── Close handlers ──────────────────────────────────────────────────
  // Both modals close to the same end-state (bare list). We deliberately
  // leave `selectedNrZgl` populated so a re-open of the same row hits the
  // useClaim cache without a fresh fetch — TanStack already keys by nrZgl,
  // so this is just preserving the cache pointer.
  const onModalClose = () => {
    setView(null);
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

      {/* Read-only detail modal — opened by a plain row click. Passing
          `onEdit` enables the «Edytuj» footer button; for non-editing roles
          (opiekun in Phase 5+) we omit it and the modal stays read-only. */}
      <ClaimDetailModal
        open={view === 'detail'}
        nrZgl={selectedNrZgl}
        onClose={onModalClose}
        onEdit={canEdit ? goToEdit : undefined}
      />

      {/* Edit / verification modal — opened by «Edytuj» inside the detail
          modal. Closing this returns to the bare list, NOT back to the
          detail modal (current UX choice — keeps the dismiss path simple). */}
      <ClaimVerificationModal
        open={view === 'edit'}
        nrZgl={selectedNrZgl}
        onClose={onModalClose}
      />
    </section>
  );
}
