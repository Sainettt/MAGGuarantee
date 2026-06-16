'use client';

// Shared read-only delegations ("Wyjazdy") table. Extracted from <FleetPanel>
// (Phase 6.4) so the SAME presentation — column set + clickable row →
// <DelegationDetailModal> — can be reused by:
//   • planista / dyspozytor fleet panels (via <FleetPanel>), and
//   • the admin all-access /employee/delegations page.
//
// The component owns its own modal open + target state (a row click opens the
// read-only VIEW modal, §6.4.1 route-card — never an edit surface). It is
// parameterised by:
//   • `rows` / `isLoading`         — the data slice + loading flag,
//   • `namespace`                  — i18n namespace for the column headers +
//                                    empty state (`planista.delegations`,
//                                    `dyspozytor.delegations`, or the new
//                                    `delegations.table` admin namespace), and
//   • `rowAriaLabel`               — per-row SR label (so each caller can speak
//                                    its own a11y string).
//
// Read-only throughout — no mutation controls. Status is a static <StatusBadge>
// (DS §6.3 — meaning by icon + label, not colour alone). Delegation status
// changes are a weryfikator concern (Phase 7), not surfaced here.

import { MapPin, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { DelegationDto } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { DelegationDetailModal } from '@/components/delegations/DelegationDetailModal';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateShort } from '@/lib/format/numbers';

interface Props {
  /** The delegation rows for the current page / scope. */
  rows: DelegationDto[];
  /** Loading flag for the backing query. */
  isLoading: boolean;
  /**
   * i18n namespace that exposes `columns.{vehicle,driver,route,period,status}`
   * + `emptyTitle` + `emptyMessage`. The planista/dyspozytor panels pass their
   * own `<role>.delegations` namespace; the admin page passes
   * `delegations.table`. Read positionally — keep the key shape in lockstep.
   */
  namespace: string;
  /** Per-row SR label for the activatable `<tr>` (e.g. «Pokaż szczegóły wyjazdu: WGM 1234»). */
  rowAriaLabel?: (row: DelegationDto) => string;
  /**
   * §8.2 — when true, the empty body shows the filtered-empty state (the
   * namespace must then expose `emptyFiltered.{title,message}`) plus a
   * «Wyczyść filtry» action wired to `onClearFilters`. When omitted the
   * data-empty (`emptyTitle`/`emptyMessage`) is shown for both cases.
   */
  hasActiveFilters?: boolean;
  /** §8.2 — resets the caller's filter bar from the filtered-empty state. */
  onClearFilters?: () => void;
}

export function DelegationsTable({
  rows,
  isLoading,
  namespace,
  rowAriaLabel,
  hasActiveFilters,
  onClearFilters,
}: Props) {
  const t = useTranslations(namespace);
  const tCommon = useTranslations('common');

  // Read-only VIEW modal — owned here so every consumer gets the row-click →
  // detail wiring for free.
  const [target, setTarget] = useState<DelegationDto | null>(null);

  const columns = useMemo<DataTableColumn<DelegationDto>[]>(
    () => [
      {
        id: 'vehicle',
        header: t('columns.vehicle'),
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.vehicle?.plateNumber ?? '—'}
          </span>
        ),
      },
      {
        id: 'driver',
        header: t('columns.driver'),
        cell: (row) => (
          <span className="font-semibold">
            {row.driver
              ? `${row.driver.firstName} ${row.driver.lastName}`
              : (row.driverNameSnapshot ?? '—')}
          </span>
        ),
      },
      {
        id: 'route',
        header: t('columns.route'),
        width: 'flex',
        truncate: 'ellipsis',
        cell: (row) => (
          <span title={`${row.departureCountry} → ${row.returnCountry}`}>
            {row.departureCountry} → {row.returnCountry}
          </span>
        ),
      },
      {
        id: 'period',
        header: t('columns.period'),
        width: 'tight',
        cell: (row) => (
          <span className="tabular-nums">
            {formatDateShort(row.departureAt)} –{' '}
            {formatDateShort(row.plannedReturnAt)}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('columns.status'),
        width: 'tight',
        // Static indicator — read-only. No dropdown / mutation control.
        cell: (row) => <StatusBadge status={row.status} />,
      },
    ],
    [t],
  );

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={setTarget}
        rowAriaLabel={rowAriaLabel}
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={MapPin}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
        emptyFiltered={
          <EmptyState
            icon={SearchX}
            title={t('emptyFiltered.title')}
            message={t('emptyFiltered.message')}
            action={
              onClearFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClearFilters}
                >
                  {tCommon('clearFilters')}
                </Button>
              ) : undefined
            }
          />
        }
      />

      <DelegationDetailModal
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        delegation={target}
      />
    </>
  );
}
