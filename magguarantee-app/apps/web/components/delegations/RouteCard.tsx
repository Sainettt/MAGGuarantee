'use client';

// Phase 6.4 / §6.4.1a — <RouteCard>. A presentational delegation-route
// composition (docs/14-design-system.md §6.4.1 / §6.4.1a / §6.4.4). Three zones
// inside one section card: departure country circle → connector (truck +
// planned-duration pill) → return country circle. Horizontal on `sm+`, a
// vertical timeline on phones.
//
// Each end carries a reported-vs-actual date pair (§6.4.1a): departure shows the
// reported `departureAt` (datetime) + — once set — the actual `actualDepartureAt`
// (date-only, docs/14 §6.4.1a); return shows the planned
// `plannedReturnAt` (date-only) + — once set — the actual `actualReturnAt`
// (date-only, mirroring the planned line). The «fakt.» actual line is omitted
// entirely when its value is null (no em-dash); the reported/planned line is
// always shown. CRITICAL: the two `actual*At` are wall-clock LABELLED UTC (the
// weryfikator types 23:30, the api stores `…T23:30:00Z` — docs/19 #16), so they
// MUST use the UTC-pinned `formatWallClock*` helpers; the browser-local
// `formatDateFull` / `formatDateTime` would shift them by the viewer's offset
// (23:30 → next day in Warsaw). `departureAt` is a true instant and
// `plannedReturnAt` date-only — they keep their browser-local helpers.
//
// It is purely presentational — it reads the already-in-hand DelegationDto, has
// no fetch, no state, no mutation. It is slotted as the value of a `fullWidth`
// row in a `span:'full'` section of <DelegationDetailModal>.
//
// Composes existing tokens only (bg-card / bg-input / border-border /
// text-text-sub / brand focus ring) — no new tokens (§6.4 surface policy).

import { ArrowDown, ChevronRight, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DelegationDto } from '@magguarantee/shared';

import {
  formatDateFull,
  formatDateTime,
  formatWallClockDate,
} from '@/lib/format/numbers';

interface Props {
  delegation: DelegationDto;
}

/**
 * Whole calendar days between `departureAt` (date portion only) and
 * `plannedReturnAt` — mirrors the zod cross-field validation
 * (`delegations.ts:113`, which compares `departureAt.slice(0,10)` to the
 * date-only `plannedReturnAt`). Returns `null` when either date is unparseable
 * or the span is negative (the schema forbids `plannedReturnAt < departureAt`,
 * but we guard defensively so the pill never renders a negative number).
 */
function planDurationDays(
  departureAt: string,
  plannedReturnAt: string,
): number | null {
  const depDay = departureAt.slice(0, 10);
  const retDay = plannedReturnAt.slice(0, 10);
  // Parse as UTC midnight so DST shifts can't move the calendar-day count.
  const dep = Date.parse(`${depDay}T00:00:00Z`);
  const ret = Date.parse(`${retDay}T00:00:00Z`);
  if (Number.isNaN(dep) || Number.isNaN(ret)) return null;
  const days = Math.round((ret - dep) / 86_400_000);
  return days >= 0 ? days : null;
}

/** A bordered country code in a 48px circle — departure / return endpoint. */
function CountryCircle({ code }: { code: string | null | undefined }) {
  return (
    <span
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-input text-sm font-bold text-text"
      aria-hidden="true"
    >
      {code?.trim() || '—'}
    </span>
  );
}

const MINI_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub';

/**
 * One line of the reported-vs-actual date stack (§6.4.1a "reported-vs-actual
 * pair" recipe): a mini-label prefix chip + the formatted value. The `actual`
 * variant tints the prefix `text-success` to signal "confirmed/real". Callers
 * omit the actual line entirely when the value is null — this component never
 * renders an em-dash placeholder (the empty rule lives at the call site).
 */
function DateLine({
  prefix,
  value,
  tone = 'reported',
}: {
  prefix: string;
  value: string;
  tone?: 'reported' | 'actual';
}) {
  return (
    <span className="text-sm tabular-nums text-text">
      <span
        className={`${MINI_LABEL} mr-1 ${tone === 'actual' ? 'text-success' : ''}`}
      >
        {prefix}
      </span>
      {value}
    </span>
  );
}

export function RouteCard({ delegation }: Props) {
  const t = useTranslations('carrier.delegations.routeCard');

  const days = planDurationDays(
    delegation.departureAt,
    delegation.plannedReturnAt,
  );

  // Real text (not icon-only) so SR users hear "4 dni · plan." (§6.4.1 a11y).
  const durationLabel =
    days != null ? t('durationDays', { days }) : t('durationUnknown');

  const ariaLabel = t('aria', {
    from: delegation.departureCountry,
    to: delegation.returnCountry,
  });

  const departureBlock = (
    <div className="flex flex-col items-start gap-1">
      <CountryCircle code={delegation.departureCountry} />
      <span className={MINI_LABEL}>{t('departure')}</span>
      {/* Reported line — always shown. `departureAt` is a genuine datetime →
          datetime helper. */}
      <DateLine
        prefix={t('reportedPrefix')}
        value={formatDateTime(delegation.departureAt)}
      />
      {/* Actual line — only once `actualDepartureAt` is set (on `w_trasie`).
          Wall-clock LABELLED UTC (docs/19 #16) → the UTC-pinned wall-clock
          helper, NEVER the browser-local formatDateTime / formatDateFull (they
          re-apply the viewer's offset: 23:30 → next day). Date-only per
          docs/14 §6.4.1a. */}
      {delegation.actualDepartureAt && (
        <DateLine
          prefix={t('actualPrefix')}
          value={formatWallClockDate(delegation.actualDepartureAt)}
          tone="actual"
        />
      )}
      <span className="text-xs text-text-sub">
        {t('postalPrefix')}{' '}
        <span className="font-mono">{delegation.departurePostalCode}</span>
      </span>
    </div>
  );

  const returnBlock = (
    <div className="flex flex-col items-start gap-1 sm:items-end sm:text-right">
      <CountryCircle code={delegation.returnCountry} />
      <span className={MINI_LABEL}>{t('return')}</span>
      {/* Planned line — always shown. `plannedReturnAt` is `@db.Date` (date-only)
          → date-only helper. */}
      <DateLine
        prefix={t('plannedPrefix')}
        value={formatDateFull(delegation.plannedReturnAt)}
      />
      {/* Actual line — only once `actualReturnAt` is set (on `zjechal`).
          Wall-clock LABELLED UTC (docs/19 #16) → UTC-pinned wall-clock date
          helper (browser-local would print 23:30 as the next day). Date-only,
          mirroring the planned line above. */}
      {delegation.actualReturnAt && (
        <DateLine
          prefix={t('actualPrefix')}
          value={formatWallClockDate(delegation.actualReturnAt)}
          tone="actual"
        />
      )}
      <span className="text-xs text-text-sub">
        {t('postalPrefix')}{' '}
        <span className="font-mono">{delegation.returnPostalCode}</span>
      </span>
    </div>
  );

  const durationPill = (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-input px-2.5 py-0.5 text-xs font-medium text-text-sub">
      {durationLabel}
    </span>
  );

  // No own border/padding — like the §6.20 <BreakdownTable>, this block fills
  // the shell's section card (which already supplies `rounded-xl border ...
  // p-5` + the section header). A self-border would double-nest the card.
  return (
    <div role="group" aria-label={ariaLabel}>
      {/* ≥sm: horizontal — departure / connector(flex-1) / return.
          <sm: vertical timeline — departure, connector, return stacked. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        {departureBlock}

        {/* Connector — horizontal hairline + truck + pill + arrowhead on sm+;
            a vertical rule + truck + pill + down-arrow on phones. */}
        <div className="flex w-full items-center justify-center gap-2 self-stretch px-1 py-1 sm:w-auto sm:flex-1">
          {/* Vertical (phone) variant. */}
          <div className="flex items-center gap-2 sm:hidden">
            <span className="h-8 w-px bg-border" aria-hidden="true" />
            <Truck size={18} className="text-text-sub" aria-hidden="true" />
            {durationPill}
            <ArrowDown
              size={16}
              className="text-text-sub"
              aria-hidden="true"
            />
          </div>
          {/* Horizontal (sm+) variant. */}
          <div className="hidden w-full items-center gap-2 sm:flex">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <Truck size={18} className="text-text-sub" aria-hidden="true" />
            {durationPill}
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <ChevronRight
              size={18}
              className="text-text-sub"
              aria-hidden="true"
            />
          </div>
        </div>

        {returnBlock}
      </div>
    </div>
  );
}
