'use client';

// Phase 12 — carrier drill-down «Porozumienia» tab (docs/14 §12.5).
//
// Two stacked tables for one carrier:
//   1. Live per-vehicle state — this carrier's guaranteed vehicles (from
//      `/guarantee-compliance`, filtered client-side to this carrierId): plate,
//      anchor (+ source tag), deadline, and the worded countdown / state badge.
//      Sorted worst-first.
//   2. Historia epizodów — the durable episode journal (from
//      `/guarantee-episodes?carrierId=`), newest-first, with the ROZLICZENIE
//      verdict: «w terminie» (green, resolvedDaysLeft ≥ 0) / «po terminie o N
//      dni» (red, < 0).
//
// When the board deep-links with `?vehicleId=`, both tables pre-filter to that
// vehicle and a «Pokaż wszystkie pojazdy» chip clears it (client-side only, no
// separate route). Empty history is a *positive* state — a good carrier — so it
// uses a green CheckCircle2, not a sad grey inbox.

import { CheckCircle2, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import type {
  GuaranteeComplianceItem,
  GuaranteeEpisodeDto,
} from '@magguarantee/shared';

import { GuaranteeCountdownBadge } from '@/components/carrier/GuaranteeCountdownBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateFull } from '@/lib/format/numbers';
import { compareByUrgency } from '@/lib/guarantee';
import {
  useGuaranteeCompliance,
  useGuaranteeEpisodes,
} from '@/lib/hooks/useGuarantee';

interface Props {
  carrierId: string;
}

export function CarrierPorozumieniaTab({ carrierId }: Props) {
  const t = useTranslations('guarantee.history');
  const tCols = useTranslations('guarantee.history.columns');
  const tSource = useTranslations('guarantee.history.source');
  const tState = useTranslations('guarantee.history.state');
  const tReason = useTranslations('guarantee.history.reason');
  const tOutcome = useTranslations('guarantee.history.outcome');
  const tFleet = useTranslations('guarantee.fleet');

  // Optional per-vehicle pre-filter from the board deep-link. Cleared by
  // rewriting the query string (keeps the tab param, drops vehicleId).
  const searchParams = useSearchParams();
  const router = useRouter();
  const vehicleId = searchParams.get('vehicleId') ?? undefined;

  const clearVehicleFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('vehicleId');
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Live board scoped to this carrier (client-side filter of the full board).
  const complianceQ = useGuaranteeCompliance();
  const liveRows = useMemo(() => {
    const rows = (complianceQ.data?.items ?? []).filter(
      (i) =>
        i.carrier?.id === carrierId &&
        (i.state === 'counting' || i.state === 'violated'),
    );
    const filtered = vehicleId
      ? rows.filter((r) => r.vehicleId === vehicleId)
      : rows;
    return [...filtered].sort(compareByUrgency);
  }, [complianceQ.data, carrierId, vehicleId]);

  // Episode archive for this carrier (+ optional vehicle) — newest first,
  // server-ordered. `vehicleId` is passed to the API when set.
  const episodesQ = useGuaranteeEpisodes({ carrierId, vehicleId });
  const episodes = episodesQ.data?.items ?? [];

  const liveColumns = useMemo<DataTableColumn<GuaranteeComplianceItem>[]>(
    () => [
      {
        id: 'vehicle',
        header: tCols('vehicle'),
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.plateNumber}
            {row.sideNumber ? (
              <span className="ml-1 font-sans font-normal text-text-sub">
                · {row.sideNumber}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'anchor',
        header: tCols('anchor'),
        cell: (row) =>
          row.anchorAt ? (
            <span className="tabular-nums">
              {formatDateFull(row.anchorAt)}
              <span className="ml-1.5 text-xs text-text-sub">
                (
                {row.anchorSource === 'agreement'
                  ? tSource('agreement')
                  : tSource('zjechal')}
                )
              </span>
            </span>
          ) : (
            <span className="text-text-sub">—</span>
          ),
      },
      {
        id: 'deadline',
        header: tCols('deadline'),
        cell: (row) => (
          <span className="tabular-nums">{formatDateFull(row.deadlineAt)}</span>
        ),
      },
      {
        id: 'state',
        header: tCols('state'),
        cell: (row) =>
          row.state === 'inactive' ? (
            <Badge variant="muted">{tFleet('inactive')}</Badge>
          ) : row.state === 'ok_active' ? (
            <Badge variant="success">{tFleet('active')}</Badge>
          ) : (
            <GuaranteeCountdownBadge daysLeft={row.daysLeft ?? 0} />
          ),
      },
    ],
    [tCols, tSource, tFleet],
  );

  const episodeColumns = useMemo<DataTableColumn<GuaranteeEpisodeDto>[]>(
    () => [
      {
        id: 'vehicle',
        header: tCols('vehicle'),
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.plateNumber ?? '—'}
            {row.sideNumber ? (
              <span className="ml-1 font-sans font-normal text-text-sub">
                · {row.sideNumber}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'anchor',
        header: tCols('anchor'),
        cell: (row) => (
          <span className="tabular-nums">
            {formatDateFull(row.anchorAt)}
            <span className="ml-1.5 text-xs text-text-sub">
              (
              {row.anchorSource === 'agreement'
                ? tSource('agreement')
                : tSource('zjechal')}
              )
            </span>
          </span>
        ),
      },
      {
        id: 'deadline',
        header: tCols('deadline'),
        cell: (row) => (
          <span className="tabular-nums">{formatDateFull(row.deadlineAt)}</span>
        ),
      },
      {
        id: 'state',
        header: tCols('state'),
        cell: (row) =>
          row.state === 'warning' ? (
            <Badge variant="warning">{tState('warning')}</Badge>
          ) : row.state === 'violated' ? (
            <Badge variant="danger">{tState('violated')}</Badge>
          ) : (
            <Badge variant="muted">{tState('resolved')}</Badge>
          ),
      },
      {
        id: 'outcome',
        header: tCols('outcome'),
        cell: (row) => {
          if (row.state !== 'resolved' || row.resolvedDaysLeft == null) {
            return <span className="text-text-sub">—</span>;
          }
          const reason = row.resolvedReason
            ? tReason(row.resolvedReason)
            : null;
          const onTime = row.resolvedDaysLeft >= 0;
          const verdict = onTime
            ? tOutcome('onTime')
            : tOutcome('late', { days: Math.abs(row.resolvedDaysLeft) });
          return (
            <span className="flex flex-col gap-0.5">
              {reason ? (
                <span className="text-xs text-text-sub">{reason}</span>
              ) : null}
              <span
                className={
                  onTime
                    ? 'text-xs font-semibold text-success'
                    : 'text-xs font-semibold text-danger'
                }
              >
                {verdict}
              </span>
            </span>
          );
        },
      },
      {
        id: 'resolvedAt',
        header: tCols('resolvedAt'),
        cell: (row) => (
          <span className="tabular-nums">
            {row.resolvedAt ? formatDateFull(row.resolvedAt) : '—'}
          </span>
        ),
      },
    ],
    [tCols, tSource, tState, tReason, tOutcome],
  );

  return (
    <div className="space-y-8">
      {/* Per-vehicle clear-filter chip when deep-linked from the board. */}
      {vehicleId ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearVehicleFilter}
          >
            {t('showAllVehicles')}
          </Button>
        </div>
      ) : null}

      {/* 1 — live per-vehicle state. */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-sub">
          {t('liveHeading')}
        </h3>
        <DataTable
          rows={liveRows}
          columns={liveColumns}
          rowKey={(r) => r.vehicleId}
          isLoading={complianceQ.isLoading}
          empty={<EmptyState icon={Truck} title={t('emptyLive')} />}
        />
      </div>

      {/* 2 — episode history. */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-sub">
          {t('episodesHeading')}
        </h3>
        <DataTable
          rows={episodes}
          columns={episodeColumns}
          rowKey={(r) => r.id}
          isLoading={episodesQ.isLoading}
          empty={
            <EmptyState
              icon={CheckCircle2}
              iconClassName="text-success"
              title={t('emptyEpisodes')}
            />
          }
        />
      </div>
    </div>
  );
}
