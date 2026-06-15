'use client';

// Phase 3 — carrier-scoped trailer list. READ-ONLY: trailers are managed by
// admin/opiekun, the carrier can only see them (mirror of the vehicles page
// pattern). Per docs/14 "Naczepy" sub-tab — Phase 3 narrowed-scope decision.

import { Container, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { TrailerDto } from '@magguarantee/shared';

import { TrailerDetailModal } from '@/components/trailers/TrailerDetailModal';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useTrailers } from '@/lib/hooks/useTrailers';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';

export default function CarrierTrailersPage() {
  const t = useTranslations('carrier.fleet.trailers');
  const tColumns = useTranslations('carrier.fleet.trailers.columns');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [trailerTypeId, setTrailerTypeId] = useState<string>('');

  const { data, isLoading } = useTrailers({
    q: search.length >= 2 ? search : undefined,
    trailerTypeId: trailerTypeId || undefined,
    limit: 50,
  });

  const typesQ = useTrailerTypes({ active: true });

  // Read-only detail modal — a plain row click opens it. Carriers cannot edit
  // trailers, so no `onEdit` is passed (footer shows only «Zamknij», §6.6).
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<TrailerDto | null>(null);

  const openDetail = (row: TrailerDto) => {
    setDetailTarget(row);
    setDetailOpen(true);
  };

  const columns = useMemo<DataTableColumn<TrailerDto>[]>(
    () => [
      {
        id: 'plate',
        header: tColumns('plate'),
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'type',
        header: tColumns('type'),
        cell: (row) =>
          row.trailerType?.shortCode
            ? `[${row.trailerType.shortCode}] ${row.trailerType.name}`
            : (row.trailerType?.name ?? '—'),
      },
      {
        id: 'active',
        header: tColumns('status'),
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
    ],
    [tColumns, tCommon],
  );

  const mailtoSubject = encodeURIComponent(t('contactOpiekunSubject'));

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <a
          href={`mailto:opiekun@magtrans.eu?subject=${mailtoSubject}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
        >
          <Mail size={14} />
          {t('contactOpiekun')}
        </a>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          className="h-10 sm:max-w-xs"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="sm:max-w-xs"
          value={trailerTypeId}
          onChange={(e) => setTrailerTypeId(e.target.value)}
          aria-label={t('filterByType')}
        >
          <option value="">{t('allTypes')}</option>
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
        onRowClick={openDetail}
        isLoading={isLoading}
        empty={
          <EmptyState
            icon={Container}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />

      <TrailerDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        trailer={detailTarget}
      />
    </section>
  );
}
