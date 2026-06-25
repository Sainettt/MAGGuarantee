'use client';

// <DelegationKmCalendar> — the "visual link" delegation↔km inside the carrier
// delegation detail modal (docs/14-design-system.md §7.7.9). A compact
// period-strip of day-tiles spanning `[departureAt, plannedReturnAt]`, joined
// to the assigned vehicle's `VehicleDailyKm` by `vehicleId` + date intersection
// (NO FK — the join is purely data-side / visual). Read-only: the carrier never
// edits km here; this is a window into the verifier's data.
//
// Same three-state vocabulary as <KmCell> §7.7.1 (drove / idle / empty) so a
// carrier and a verifier read the same colours. Wraps to multiple rows on a
// long trip; never horizontal-scrolls inside the modal.

import { Check, Flag, Gauge, ParkingSquare, Plane } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { DelegationDto, VehicleDailyKmDto } from '@magguarantee/shared';

import { useVehicleDailyKmHistory } from '@/lib/hooks/useVehicleKm';
import {
  calendarFetchTo,
  deriveCalendarWindow,
} from '@/lib/format/delegationCalendar';
import {
  daySpan,
  formatDayMonth,
  inclusiveDayCount,
  todayIso,
  weekdayIndexMonFirst,
} from '@/lib/format/week';
import { cn } from '@/lib/utils';

const WEEKDAY_KEYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

interface Props {
  delegation: DelegationDto;
}

export function DelegationKmCalendar({ delegation }: Props) {
  const t = useTranslations('delegation.kmCalendar');
  const tWeekday = useTranslations('weryfikator.km.weekday');

  // "Today" in the MAGTRANS business timezone (Europe/Warsaw) — the same
  // predicate the km-board uses (lib/format/week → shared businessTodayIso),
  // so the open-trip upper bound never drifts with the browser's local TZ.
  const today = todayIso();

  // FETCH range — anchored at departure, broadened on the `to` side so the
  // query returns EVERY existing km row (incl. late-return overruns the legacy
  // `plannedReturnAt` ceiling hid). Render window is narrowed below.
  const fetchFrom = delegation.departureAt.slice(0, 10);
  const fetchTo = calendarFetchTo(delegation, today);

  const vehicleId = delegation.vehicleId;
  const { data, isLoading } = useVehicleDailyKmHistory(vehicleId, {
    from: fetchFrom,
    to: fetchTo,
  });

  // RENDER window — data-driven; clamps the empty tail to the real trip end
  // (actualReturnAt for zjechal, last km day for in-transit overruns).
  const { fromIso, toIso } = useMemo(
    () => deriveCalendarWindow(delegation, data ?? [], today),
    [delegation, data, today],
  );
  const days = useMemo(() => daySpan(fromIso, toIso), [fromIso, toIso]);
  const dayCount = inclusiveDayCount(fromIso, toIso);

  const byDate = useMemo(() => {
    const map = new Map<string, VehicleDailyKmDto>();
    for (const row of data ?? []) map.set(row.date, row);
    return map;
  }, [data]);

  const sumKm = (data ?? [])
    .filter((r) => r.state === 'drove')
    .reduce((sum, r) => sum + (r.km ?? 0), 0);

  const hasAnyData = (data ?? []).length > 0;
  const plate = delegation.vehicle?.plateNumber ?? '—';

  return (
    <div
      aria-label={t('aria', {
        plate,
        from: formatDayMonth(fromIso),
        to: formatDayMonth(toIso),
      })}
    >
      {/* Summary line */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-sub">
          {t('summary', {
            plate,
            from: formatDayMonth(fromIso),
            to: formatDayMonth(toIso),
            days: t('days', { n: dayCount }),
          })}
        </p>
        <span className="font-mono text-sm tabular-nums text-text">
          {t('sumKm', { sum: sumKm.toLocaleString('pl-PL') })}
        </span>
      </div>

      {/* Day-strip */}
      <div className="flex flex-wrap gap-2">
        {days.map((d, idx) => {
          const row = byDate.get(d);
          const state = row?.state ?? null;
          const wdIdx = weekdayIndexMonFirst(d);
          const isDeparture = idx === 0;
          const isReturn = idx === days.length - 1;
          return (
            <div
              key={d}
              className={cn(
                'relative min-w-[64px] rounded-lg border border-border p-2 text-center',
                state === 'drove' ? 'bg-success/10' : 'bg-card',
                state === 'idle' && 'bg-input',
              )}
            >
              {/* Trip-end markers — subtle corner anchors. */}
              {isDeparture ? (
                <Plane
                  size={10}
                  className="absolute right-1 top-1 text-text-sub"
                  aria-hidden="true"
                />
              ) : isReturn ? (
                <Flag
                  size={10}
                  className="absolute right-1 top-1 text-text-sub"
                  aria-hidden="true"
                />
              ) : null}

              <p className="text-[10px] uppercase text-text-sub">
                {tWeekday(WEEKDAY_KEYS[wdIdx])}
              </p>
              <p className="text-xs tabular-nums text-text-sub">
                {formatDayMonth(d)}
              </p>

              <div className="mt-1">
                {state === 'drove' ? (
                  <span className="inline-flex items-center justify-center gap-0.5">
                    <Check size={11} className="text-success" aria-hidden="true" />
                    <span className="font-mono font-semibold tabular-nums text-text">
                      {row?.km ?? 0}
                    </span>
                  </span>
                ) : state === 'idle' ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-text-sub">
                    <ParkingSquare size={11} aria-hidden="true" />
                    {t('idle')}
                  </span>
                ) : (
                  <span className="text-text-sub/60" aria-hidden="true">
                    {t('empty')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* No km data for the period (vehicle present, verifier hasn't recorded) */}
      {!isLoading && !hasAnyData ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-text-sub">
          <Gauge size={13} aria-hidden="true" />
          {t('noData')}
        </p>
      ) : null}
    </div>
  );
}
