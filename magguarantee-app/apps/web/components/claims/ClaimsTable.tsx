'use client';

// Phase 4 — main claims table on `/employee/claims` (admin + pracownik).
// Wraps the Phase 2 `<DataTable>` with the column set documented in
// `docs/14-design-system.md` § Phase 4 "<ClaimsTable>".
//
// Behavioral notes:
//   - Full-row click opens the verification modal (the page owns the
//     selection state; the table is presentational).
//   - Money cells are toned by STATUS via `lib/claims/money.ts` — green for a
//     granted amount, red for a refused claim, neutral for a pending one. The
//     old rule (brand red whenever the amount was > 0) is gone: it painted an
//     accepted wniosek in exactly the same alarm colour as a rejected one.
//   - Tooltips are native `title` attributes — when shadcn Tooltip lands
//     site-wide we can swap, but for v1 native is enough and a11y-safe.

import { FileSearch, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ClaimListItem } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { ReklamacjaResolutionChip } from '@/components/claims/ReklamacjaResolutionChip';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { MONEY_TONE_TEXT, moneyTone } from '@/lib/claims/money';
import {
  formatDateShort,
  formatEur,
  formatKmCompact,
} from '@/lib/format/numbers';
import { relativeTimeKey } from '@/lib/format/relative-time';
import { cn } from '@/lib/utils';

export interface ClaimsTableProps {
  rows: ClaimListItem[];
  isLoading?: boolean;
  onRowClick: (row: ClaimListItem) => void;
  /** §8.2 — drives the data-vs-filtered empty split. */
  hasActiveFilters?: boolean;
  /** §8.2 — resets the filter bar from the filtered-empty state. */
  onClearFilters?: () => void;
}

export function ClaimsTable({
  rows,
  isLoading,
  onRowClick,
  hasActiveFilters,
  onClearFilters,
}: ClaimsTableProps) {
  const t = useTranslations('employee.claims');
  const tCommon = useTranslations('common');
  const tRel = useTranslations();

  const columns = useMemo<DataTableColumn<ClaimListItem>[]>(
    () => [
      {
        id: 'nrZgl',
        header: t('columns.nrZgl'),
        cell: (row) => (
          <span className="font-mono font-bold text-text tabular-nums">
            {row.nrZgl}
          </span>
        ),
      },
      {
        id: 'carrier',
        header: t('columns.carrier'),
        cell: (row) => (
          <span
            className="truncate max-w-[14ch] inline-block align-middle"
            title={row.carrierName ?? ''}
          >
            {row.carrierName ?? '—'}
          </span>
        ),
      },
      {
        id: 'vehicle',
        header: t('columns.vehicle'),
        cell: (row) => (
          <span className="font-mono text-text">{row.vehiclePlate}</span>
        ),
      },
      {
        id: 'period',
        header: t('columns.period'),
        cell: (row) => (
          <span className="text-text-sub tabular-nums whitespace-nowrap">
            {formatDateShort(row.dateStart)} → {formatDateShort(row.dateEnd)}
          </span>
        ),
      },
      {
        id: 'mileage',
        header: t('columns.mileage'),
        align: 'right',
        cell: (row) => (
          <span
            className="font-mono tabular-nums"
            title={`${row.mileage.toLocaleString('pl-PL')} km`}
          >
            {formatKmCompact(row.mileage)}
          </span>
        ),
      },
      // Two money columns, not one. «Wnioskowana» is what the carrier asked
      // for; «Zatwierdzona» is what was actually granted — they diverge
      // whenever a verifier corrects the amount, and collapsing them into a
      // single «Dopłata» column hid that divergence from the list entirely.
      {
        id: 'amountRequested',
        header: t('columns.amountRequested'),
        align: 'right',
        cell: (row) =>
          // `origPaymentEur` — the FROZEN submit-time figure. This column used
          // to read `amountRequested`, which every recalc rewrote to the
          // current `paymentEur`, so the header said "wnioskowana" while the
          // cell showed the post-verification number. Legacy rows have no
          // snapshot: em-dash, never a fallback to the current figure (that is
          // exactly the lie we just removed). Neutral tone — a request carries
          // no verdict, and red here would read as "rejected".
          row.origPaymentEur == null ? (
            <span className="text-text-sub">—</span>
          ) : (
            <span className="font-mono font-bold tabular-nums whitespace-nowrap text-text">
              {formatEur(row.origPaymentEur)}
            </span>
          ),
      },
      {
        id: 'amountApproved',
        header: t('columns.amountApproved'),
        align: 'right',
        cell: (row) =>
          // Null ⇒ no decision yet. An em-dash, NOT «0,00 €» — a zero payout is
          // a real decision and must not be confused with an undecided claim.
          row.amountApproved == null ? (
            <span className="text-text-sub">—</span>
          ) : (
            <span
              className={cn(
                'font-mono font-bold tabular-nums whitespace-nowrap',
                // Status-driven, shared with the carrier views: green =
                // granted, red = refused. Never keyed off the amount itself.
                MONEY_TONE_TEXT[moneyTone(row.status)],
              )}
            >
              {formatEur(row.amountApproved)}
            </span>
          ),
      },
      {
        id: 'status',
        header: t('columns.status'),
        // Two stacked chips, never one: since 2026-07-31 the status carries NO
        // reklamacja information (a decided reklamacja rolls the wniosek back to
        // `statusBeforeReklamacja`), so the secondary resolution chip under the
        // badge is the only way an outcome is visible in a list. It never
        // replaces <StatusBadge> and never annotates its label (§6.5.15 C).
        cell: (row) => (
          <span
            onClick={(e) => e.stopPropagation()}
            role="presentation"
            className="flex flex-col items-start gap-1"
          >
            <StatusBadge status={row.status} />
            {row.reklamacjaSubmitted && (
              <ReklamacjaResolutionChip
                resolution={row.reklamacjaResolution}
                className="text-[11px]"
              />
            )}
          </span>
        ),
      },
      {
        id: 'updatedAt',
        header: t('columns.updatedAt'),
        cell: (row) => {
          const r = relativeTimeKey(row.createdAt);
          return (
            <span
              className="text-text-sub text-xs whitespace-nowrap"
              title={new Date(row.createdAt).toISOString()}
            >
              {tRel(r.key, r.vars as Record<string, string | number>)}
            </span>
          );
        },
      },
    ],
    [t, tRel],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={onRowClick}
      isLoading={isLoading}
      hasActiveFilters={hasActiveFilters}
      empty={
        <EmptyState
          icon={FileSearch}
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
  );
}
