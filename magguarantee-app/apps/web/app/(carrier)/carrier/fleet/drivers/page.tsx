'use client';

// Phase 3 — carrier-scoped drivers CRUD. Same Sheet pattern as the employee
// page, but `carrierId` is auto-injected from the carrier's session via
// <DriverSheetCarrier>. The list query is implicitly scoped by the API.

import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DriverDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { useDrivers } from '@/lib/hooks/useDrivers';
import { useMyCarrierId } from '@/lib/hooks/useMyCarrierId';

import { DriverSheetCarrier } from './DriverSheetCarrier';

export default function CarrierDriversPage() {
  const [search, setSearch] = useState('');
  const carrierIdQ = useMyCarrierId();
  const carrierId = carrierIdQ.data ?? null;

  const { data, isLoading } = useDrivers({
    q: search.length >= 2 ? search : undefined,
    limit: 50,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<DriverDto | null>(null);

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: DriverDto) => {
    setTarget(row);
    setSheetOpen(true);
  };

  const columns = useMemo<DataTableColumn<DriverDto>[]>(
    () => [
      {
        id: 'name',
        header: 'Imię i nazwisko',
        cell: (row) => (
          <span className="font-semibold">
            {row.firstName} {row.lastName}
          </span>
        ),
      },
      {
        id: 'phone',
        header: 'Telefon',
        cell: (row) => row.phone ?? '—',
      },
      {
        id: 'license',
        header: 'Numer prawa jazdy',
        cell: (row) => row.driverLicenseNumber ?? '—',
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
      {
        id: 'actions',
        header: <span className="sr-only">Akcje</span>,
        align: 'right',
        cell: (row) => (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
            aria-label={`Edytuj ${row.firstName} ${row.lastName}`}
          >
            <Pencil size={14} />
            Edytuj
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          Kierowcy
        </h1>
        <Button size="sm" onClick={openCreate} disabled={!carrierId}>
          <Plus size={14} />
          Nowy kierowca
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          className="h-10 sm:max-w-xs"
          placeholder="Szukaj imienia / nazwiska"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        isLoading={isLoading}
        empty={
          <EmptyState
            title="Brak kierowców"
            message="Dodaj pierwszego kierowcę swojej firmy."
          />
        }
      />

      <DriverSheetCarrier
        open={sheetOpen}
        driver={target}
        carrierId={carrierId}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
