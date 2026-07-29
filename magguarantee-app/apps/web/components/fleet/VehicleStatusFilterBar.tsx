'use client';

// docs/14 §15 — the "a KPI tile is filtering this table" bar.
//
// The carrier / planista / dyspozytor panels have no separate vehicles route to
// navigate to, so their KPI tiles toggle an IN-PAGE filter instead of linking
// out. A pressed tile alone is too quiet a signal for "half your fleet just
// disappeared from the table", so the filtered table always carries this bar:
// which bucket is applied, how many rows survived, and one obvious way out.
//
// Shared by both panels so the two never drift; state stays with the caller
// (the tile that set it lives there too).

import { useTranslations } from 'next-intl';
import type { VehicleLifecycleStatus } from '@magguarantee/shared';

import { VehicleStatusBadge } from '@/components/carrier/VehicleStatusBadge';
import { Button } from '@/components/ui/Button';

export interface VehicleStatusFilterBarProps {
  status: VehicleLifecycleStatus;
  /** Rows surviving the filter — spelled out, so 0 doesn't read as a bug. */
  count: number;
  onClear: () => void;
}

export function VehicleStatusFilterBar({
  status,
  count,
  onClear,
}: VehicleStatusFilterBarProps) {
  const t = useTranslations('fleet.statusFilter');
  const tCommon = useTranslations('common');

  return (
    <div
      // `role="status"` — flipping a tile changes the table underneath without
      // moving focus, so screen readers get the new filter announced politely.
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-input/50 px-3 py-2"
    >
      <span className="text-sm font-semibold text-text-sub">{t('label')}</span>
      <VehicleStatusBadge status={status} />
      <span className="text-sm text-text-sub">{t('count', { count })}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto"
        onClick={onClear}
      >
        {tCommon('clearFilters')}
      </Button>
    </div>
  );
}
