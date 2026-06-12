'use client';

// <KmHeaderTiles> — the six-tile counter strip above the km-grid
// (docs/14-design-system.md §7.7.2). Composes the existing <KpiCard> only;
// `tone="purple"` is NEVER used, and there is deliberately no orange/red
// aggregate (a parked truck is not an error). Responsive grid family is
// identical to the §6.3.3 dyspozytor strip.

import {
  Car,
  CalendarRange,
  Gauge,
  ParkingSquare,
  StickyNote,
  Truck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleKmBoardItemDto } from '@magguarantee/shared';

import { KpiCard } from '@/components/dashboard/KpiCard';
import { isoWeekLabel } from '@/lib/format/week';

interface KmHeaderTilesProps {
  items: VehicleKmBoardItemDto[];
  /** Monday `YYYY-MM-DD` of the visible week — drives the TYDZIEŃ label. */
  weekStart: string;
  loading?: boolean;
}

export function KmHeaderTiles({
  items,
  weekStart,
  loading,
}: KmHeaderTilesProps) {
  const t = useTranslations('weryfikator.km.tiles');

  const tractors = items.length;
  const inMotion = items.filter((v) => v.motionStatus === 'w_ruchu').length;
  const idle = items.filter((v) => v.motionStatus === 'nie_jezdzi').length;
  const sumKm = items.reduce((sum, v) => sum + v.kmSum, 0);
  const notes = items.reduce(
    (count, v) =>
      count + v.cells.filter((c) => c.notes && c.notes.trim()).length,
    0,
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <KpiCard
        label={t('week')}
        value={isoWeekLabel(weekStart)}
        tone="neutral"
        icon={CalendarRange}
        loading={loading}
      />
      <KpiCard
        label={t('tractors')}
        value={tractors}
        tone="neutral"
        icon={Truck}
        loading={loading}
      />
      <KpiCard
        label={t('inMotion')}
        value={inMotion}
        tone="green"
        icon={Car}
        loading={loading}
      />
      <KpiCard
        label={t('idle')}
        value={idle}
        tone="neutral"
        icon={ParkingSquare}
        loading={loading}
      />
      <KpiCard
        label={t('sumKm')}
        value={sumKm.toLocaleString('pl-PL')}
        tone="blue"
        icon={Gauge}
        loading={loading}
      />
      <KpiCard
        label={t('notes')}
        value={notes}
        tone="neutral"
        icon={StickyNote}
        loading={loading}
      />
    </div>
  );
}
