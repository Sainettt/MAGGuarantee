'use client';

// Phase 6.3 — shared read-only fleet sub-tables.
//
// The planista (6.4) and dyspozytor (6.5) panels render the same three
// read-only tables over the slim `VehicleListItem` / `DriverListItem` /
// `TrailerListItem` shapes returned by `/fleet/planista` and
// `/fleet/dyspozytor`. Rather than duplicate the column definitions in both
// pages (as the opieka drill-down does for its own `VehicleDto`-based tables),
// we lift them here so both role panels share one definition — per the DS
// §6.3.4 suggestion ("consider lifting the opieka sub-tables into a shared
// `components/fleet/` module").
//
// These tables are STRICTLY read-only: no edit/delete column, no row-click
// mutation, inert rows (whole-row hover for affordance only). The «Auta» column
// set mirrors the carrier reference table (§6.3.2 / §6.4): plate, side, type,
// EURO, ADR, GB/IT/FR permits, last-drove, status. Phase 6.4 (§6.4.2) added the
// EURO / ADR / GB / IT / FR / lastDroveAt compliance fields to the slim
// `VehicleListItem` DTO, so these columns render real payload the list item
// already carries — they are no longer fabricated or omitted. Per DS §6.4.2
// the rate/pricing columns stay excluded for planista/dyspozytor.

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type {
  DriverListItem,
  TrailerListItem,
  VehicleListItem,
} from '@magguarantee/shared';

import { VehicleStatusBadge } from '@/components/carrier/VehicleStatusBadge';
import { PermitCell } from '@/components/fleet/PermitCell';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateFull } from '@/lib/format/numbers';
import { Car, Truck, User } from 'lucide-react';

function ActiveBadge({ active }: { active: boolean }) {
  const tCommon = useTranslations('common');
  return active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );
}

interface FleetTableProps<T> {
  rows: T[];
  isLoading: boolean;
  /**
   * Namespace under which the table reads `columns.*`, `emptyTitle`,
   * `emptyMessage`. Both `planista.vehicles` and `dyspozytor.vehicles` expose
   * the same key shape, so the panel passes the role-scoped namespace and the
   * table stays role-agnostic.
   */
  namespace: string;
  /**
   * Optional row-click handler (§6.4.3). When set the row becomes a keyboard-
   * operable activation target (handled by the `DataTable` primitive) and a
   * click opens the matching read-only detail modal — never an edit surface.
   */
  onRowClick?: (row: T) => void;
  /** Optional accessible per-row label for the activatable `<tr>` (§6.4.3). */
  rowAriaLabel?: (row: T) => string;
}

// ─── Auta ────────────────────────────────────────────────

export function FleetVehiclesTable({
  rows,
  isLoading,
  namespace,
  onRowClick,
  rowAriaLabel,
}: FleetTableProps<VehicleListItem>) {
  const t = useTranslations(namespace);

  const columns = useMemo<DataTableColumn<VehicleListItem>[]>(
    () => [
      {
        id: 'plate',
        header: t('columns.plate'),
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'side',
        header: t('columns.side'),
        cell: (row) => row.sideNumber ?? '—',
      },
      {
        id: 'type',
        header: t('columns.type'),
        cell: (row) => row.type ?? '—',
      },
      {
        id: 'euro',
        header: t('columns.euro'),
        align: 'center',
        cell: (row) =>
          row.euro ? <Badge variant="muted">{row.euro}</Badge> : '—',
      },
      {
        id: 'adr',
        header: t('columns.adr'),
        align: 'center',
        cell: (row) =>
          row.adr ? (
            <Badge variant="warning">ADR</Badge>
          ) : (
            <span className="text-text-sub">—</span>
          ),
      },
      {
        id: 'gb',
        header: t('columns.gb'),
        align: 'center',
        cell: (row) => <PermitCell value={row.gb} label={t('columns.gb')} />,
      },
      {
        id: 'it',
        header: t('columns.it'),
        align: 'center',
        cell: (row) => <PermitCell value={row.it} label={t('columns.it')} />,
      },
      {
        id: 'fr',
        header: t('columns.fr'),
        align: 'center',
        cell: (row) => <PermitCell value={row.fr} label={t('columns.fr')} />,
      },
      {
        id: 'lastDroveAt',
        header: t('columns.lastDroveAt'),
        cell: (row) => (
          <span className="tabular-nums">{formatDateFull(row.lastDroveAt)}</span>
        ),
      },
      {
        // Vehicle-status rework §6.3.6 — the STATUS column now carries the
        // delegation-driven lifecycle badge (the old `active ? Aktywne :
        // Nieaktywne` flag is retired; `active=false` surfaces as «Wyłączona»).
        id: 'status',
        header: t('columns.active'),
        width: 'tight',
        cell: (row) => (
          <VehicleStatusBadge
            status={row.lifecycleStatus}
            daysSinceReturn={row.daysSinceReturn}
          />
        ),
      },
    ],
    [t],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={onRowClick}
      rowAriaLabel={rowAriaLabel}
      isLoading={isLoading}
      empty={
        <EmptyState
          icon={Car}
          title={t('emptyTitle')}
          message={t('emptyMessage')}
        />
      }
    />
  );
}

// ─── Kierowcy ────────────────────────────────────────────

export function FleetDriversTable({
  rows,
  isLoading,
  namespace,
  onRowClick,
  rowAriaLabel,
}: FleetTableProps<DriverListItem>) {
  const t = useTranslations(namespace);

  const columns = useMemo<DataTableColumn<DriverListItem>[]>(
    () => [
      {
        id: 'name',
        header: t('columns.name'),
        cell: (row) => (
          <span className="font-semibold">
            {row.firstName} {row.lastName}
          </span>
        ),
      },
      {
        id: 'phone',
        header: t('columns.phone'),
        cell: (row) => row.phone || '—',
      },
      {
        id: 'active',
        header: t('columns.active'),
        width: 'tight',
        cell: (row) => <ActiveBadge active={row.active} />,
      },
    ],
    [t],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={onRowClick}
      rowAriaLabel={rowAriaLabel}
      isLoading={isLoading}
      empty={
        <EmptyState
          icon={User}
          title={t('emptyTitle')}
          message={t('emptyMessage')}
        />
      }
    />
  );
}

// ─── Naczepy ─────────────────────────────────────────────

export function FleetTrailersTable({
  rows,
  isLoading,
  namespace,
  onRowClick,
  rowAriaLabel,
}: FleetTableProps<TrailerListItem>) {
  const t = useTranslations(namespace);

  const columns = useMemo<DataTableColumn<TrailerListItem>[]>(
    () => [
      {
        id: 'plate',
        header: t('columns.plate'),
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'type',
        header: t('columns.type'),
        cell: (row) => row.trailerTypeName || '—',
      },
      {
        id: 'active',
        header: t('columns.active'),
        width: 'tight',
        cell: (row) => <ActiveBadge active={row.active} />,
      },
    ],
    [t],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={onRowClick}
      rowAriaLabel={rowAriaLabel}
      isLoading={isLoading}
      empty={
        <EmptyState
          icon={Truck}
          title={t('emptyTitle')}
          message={t('emptyMessage')}
        />
      }
    />
  );
}
