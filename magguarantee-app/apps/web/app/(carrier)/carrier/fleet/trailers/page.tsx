'use client';

// Phase 3 — carrier-scoped trailers CRUD. Same pattern as the employee
// trailers page, scoped automatically by the API to the carrier's own rows.

import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TrailerDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useMyCarrierId } from '@/lib/hooks/useMyCarrierId';
import { useTrailers } from '@/lib/hooks/useTrailers';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';

import { TrailerSheetCarrier } from './TrailerSheetCarrier';

export default function CarrierTrailersPage() {
  const [search, setSearch] = useState('');
  const [trailerTypeId, setTrailerTypeId] = useState<string>('');
  const carrierIdQ = useMyCarrierId();
  const carrierId = carrierIdQ.data ?? null;

  const { data, isLoading } = useTrailers({
    q: search.length >= 2 ? search : undefined,
    trailerTypeId: trailerTypeId || undefined,
    limit: 50,
  });

  const typesQ = useTrailerTypes({ active: true });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<TrailerDto | null>(null);

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: TrailerDto) => {
    setTarget(row);
    setSheetOpen(true);
  };

  const columns = useMemo<DataTableColumn<TrailerDto>[]>(
    () => [
      {
        id: 'plate',
        header: 'Numer rejestracyjny',
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'type',
        header: 'Typ',
        cell: (row) =>
          row.trailerType?.shortCode
            ? `[${row.trailerType.shortCode}] ${row.trailerType.name}`
            : (row.trailerType?.name ?? '—'),
      },
      {
        id: 'brand',
        header: 'Marka / model',
        cell: (row) =>
          [row.brand, row.model].filter(Boolean).join(' ') || '—',
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
            aria-label={`Edytuj ${row.plateNumber}`}
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
          Naczepy
        </h1>
        <Button size="sm" onClick={openCreate} disabled={!carrierId}>
          <Plus size={14} />
          Nowa naczepa
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          className="h-10 sm:max-w-xs"
          placeholder="Szukaj numeru rejestracyjnego"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="sm:max-w-xs"
          value={trailerTypeId}
          onChange={(e) => setTrailerTypeId(e.target.value)}
          aria-label="Filtruj po typie"
        >
          <option value="">Wszystkie typy</option>
          {(typesQ.data ?? []).map((tt) => (
            <option key={tt.id} value={tt.id}>
              {tt.shortCode ? `[${tt.shortCode}] ` : ''}
              {tt.name}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        isLoading={isLoading}
        empty={
          <EmptyState
            title="Brak naczep"
            message="Dodaj pierwszą naczepę swojej firmy."
          />
        }
      />

      <TrailerSheetCarrier
        open={sheetOpen}
        trailer={target}
        carrierId={carrierId}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
