'use client';

// Phase 6.4 — <RouteCard>. A presentational delegation-route composition
// (docs/14-design-system.md §6.4.1 / §6.4.4). Three zones inside one section
// card: departure country circle → connector (truck + planned-duration pill)
// → return country circle. Horizontal on `sm+`, a vertical timeline on phones.
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

import { formatDateFull, formatDateTime } from '@/lib/format/numbers';

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
      <span className="text-sm tabular-nums text-text">
        {formatDateTime(delegation.departureAt)}
      </span>
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
      <span className="text-sm tabular-nums text-text">
        {t('plannedPrefix')} {formatDateFull(delegation.plannedReturnAt)}
      </span>
      <span className="text-xs text-text-sub">
        {t('postalPrefix')}{' '}
        <span className="font-mono">{delegation.returnPostalCode}</span>
      </span>
      <span className="text-xs text-text-sub">
        {t('actualPrefix')}{' '}
        {delegation.actualReturnAt
          ? formatDateTime(delegation.actualReturnAt)
          : '—'}
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
