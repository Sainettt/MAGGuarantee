'use client';

// Phase 3 — carrier-scoped vehicle list. READ-ONLY: vehicles are managed by
// the opiekun, the carrier can only see them. Per docs/14 "Auta" sub-tab.

import { Mail, Truck } from 'lucide-react';
import { useMemo } from 'react';
import type { VehicleListItem } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

export default function CarrierVehiclesPage() {
  const { data, isLoading } = useMyFleet();
  const vehicles = data?.vehicles ?? [];

  const columns = useMemo<DataTableColumn<VehicleListItem>[]>(
    () => [
      {
        id: 'plate',
        header: 'Numer rejestracyjny',
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'side',
        header: 'Numer boczny',
        cell: (row) => row.sideNumber ?? '—',
      },
      {
        id: 'brand',
        header: 'Marka / model',
        cell: (row) =>
          [row.brand, row.model].filter(Boolean).join(' ') || '—',
      },
      {
        id: 'type',
        header: 'Typ',
        cell: (row) => row.type ?? '—',
      },
      {
        id: 'active',
        header: 'Status',
        cell: (row) =>
          row.active ? (
            <Badge variant="success">Aktywny</Badge>
          ) : (
            <Badge variant="muted">Nieaktywny</Badge>
          ),
      },
    ],
    [],
  );

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          Pojazdy
        </h1>
        <a
          href="mailto:opiekun@magtrans.eu?subject=Zmiana%20danych%20pojazdu"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
        >
          <Mail size={14} />
          Skontaktuj się z opiekunem
        </a>
      </div>

      <DataTable
        rows={vehicles}
        columns={columns}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        empty={
          <EmptyState
            icon={Truck}
            title="Brak pojazdów"
            message="Skontaktuj się z opiekunem, aby dodać pojazd."
          />
        }
      />
    </section>
  );
}
