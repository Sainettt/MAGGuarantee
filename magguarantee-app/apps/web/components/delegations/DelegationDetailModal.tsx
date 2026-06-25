'use client';

// Phase 3 / redesigned Phase 6.4 — DelegationDetailModal. A thin, entity-
// specific wrapper that maps a DelegationDto into the generic
// <EntityDetailModal> props (docs/14-design-system.md §6.4.1). The generic
// shell is NOT re-implemented here.
//
// Layout (§6.4.1 "route-card"):
//   Header  — title = vehicle plate (mono) + status badge ONLY (no subtitle).
//   Block A — <RouteCard> (span:'full', fullWidth row): departure circle →
//             truck + planned-duration pill → return circle.
//   Block B — driver + vehicle strip (span:'full', fullWidth row): driver
//             name + phone | NR REJ. + Naczepa <plate>.
//   Block C — «STATUS I AUDYT» (normal label/value <dl> section): reportedBy/
//             At, verifiedBy/At, notes (notes is a fullWidth long-text row).
//   Footer  — «Utworzono {createdAt}» meta + «Zamknij» (read-only — no onEdit).
//
// All 19 DelegationDto fields are accounted for (see the §6.4.1 mapping). The
// modal width is overridden to `max-w-2xl` — a single-column route view reads
// better narrower than the dense 2-column field grids that the default
// `max-w-5xl` width exists for.
//
// Read-only consumer everywhere (carrier list, planista/dyspozytor Wyjazdy
// rows) — no `onEdit` is passed, so the footer shows only «Zamknij» (§6.6).

import { ClipboardCheck, Gauge, Truck, User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type {
  DelegationDto,
  VehicleDispatchTeamDto,
} from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { DelegationKmCalendar } from '@/components/delegations/DelegationKmCalendar';
import { RouteCard } from '@/components/delegations/RouteCard';
import { TeamMembers } from '@/components/teams/TeamMembers';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import { emptyValue, textValue } from '@/components/ui/entity-detail-values';
import { AlertTriangle } from 'lucide-react';
import { formatDateFull, formatDateTime } from '@/lib/format/numbers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delegation: DelegationDto | null;
}

/**
 * Reads the CURRENT dispatch team off the delegation's vehicle (resolved live
 * by `vehicleId`, not a delegation-time snapshot — §7.9.7).
 *
 * The `DelegationDto.vehicle` mini-shape is `{ id, plateNumber }` TODAY — it
 * does NOT yet carry `dispatchTeam`. This narrows for the field defensively so
 * the «ZESPÓŁ PROWADZĄCY» block lights up the instant api-agent widens the
 * delegation vehicle mini with `dispatchTeam` (additive, non-sensitive), and
 * stays absent (`undefined`) until then. See the report's api follow-up.
 */
function readVehicleDispatchTeam(
  delegation: DelegationDto,
): VehicleDispatchTeamDto | null | undefined {
  const vehicle = delegation.vehicle as
    | { dispatchTeam?: VehicleDispatchTeamDto | null }
    | null;
  return vehicle?.dispatchTeam;
}

/** "dd.MM.yyyy, HH:mm" rendered inside an em-dash-aware <dd>. */
function dateTimeValue(iso: string | null | undefined): ReactNode {
  return iso ? <span>{formatDateTime(iso)}</span> : emptyValue();
}

/**
 * "dd.MM.yyyy" (date-only). Used for `actualReturnAt`, which the weryfikator
 * submits as a date with no time — rendering it with `formatDateTime` showed a
 * spurious "02:00" (UTC-midnight shifted into Europe/Warsaw). Date-only avoids
 * the shift.
 */
function dateValue(iso: string | null | undefined): ReactNode {
  return iso ? <span>{formatDateFull(iso)}</span> : emptyValue();
}

const STRIP_MINI_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub';

/**
 * The driver + vehicle strip (§6.4.1 Block B). Driver name + phone on the left
 * (where the driver lives now that it's out of the header), vehicle plate +
 * «Naczepa {plate}» on the right. Lives inline — not catalogue-worthy.
 */
function DriverVehicleStrip({ delegation }: { delegation: DelegationDto }) {
  const tForm = useTranslations('carrier.delegations.form');
  const tStrip = useTranslations('carrier.delegations.strip');

  const driverFullName = delegation.driver
    ? `${delegation.driver.firstName} ${delegation.driver.lastName}`.trim()
    : delegation.driverNameSnapshot;

  // No own border/padding — fills the shell's section card (§6.20 pattern),
  // same as <RouteCard>. The section header supplies the label.
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Driver half */}
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-input text-text-sub"
            aria-hidden="true"
          >
            <User size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {driverFullName?.trim() || '—'}
            </p>
            <p className="truncate font-mono text-xs text-text-sub">
              {delegation.driverPhoneSnapshot?.trim() || '—'}
            </p>
          </div>
        </div>

        {/* Vehicle half */}
        <div className="flex flex-col gap-1.5 sm:items-end sm:text-right">
          <div className="flex items-baseline gap-2 sm:flex-row-reverse">
            <span className="font-mono font-semibold text-text">
              {delegation.vehicle?.plateNumber ?? '—'}
            </span>
            <span className={STRIP_MINI_LABEL}>{tForm('vehicle')}</span>
          </div>
          <span className="font-mono text-sm text-text-sub">
            {tStrip('trailer', {
              plate: delegation.trailer?.plateNumber ?? '—',
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DelegationDetailModal({
  open,
  onOpenChange,
  delegation,
}: Props) {
  const t = useTranslations('carrier.delegations');
  const tForm = useTranslations('carrier.delegations.form');
  const tSections = useTranslations('carrier.delegations.sections');
  const tDetail = useTranslations('entityDetail');
  const tKmCal = useTranslations('delegation.kmCalendar');
  const tTeam = useTranslations('team');

  // The modal is only rendered with a target; bail defensively so the hooks
  // above still run unconditionally (rules-of-hooks safe).
  if (!delegation) return null;

  // ── Header badge row — status only (matches the list column). No subtitle
  //    (the driver moved into Block B — §6.4.1). ────────────────────────────
  const badges: ReactNode = <StatusBadge status={delegation.status} />;

  // ── Sections — all span:'full' so the body is a single column ──────────
  const sections: EntityDetailSection[] = [
    // Block A — RouteCard (fullWidth row in a full-span section).
    {
      title: tSections('route'),
      icon: Truck,
      span: 'full',
      rows: [
        {
          label: tSections('route'),
          value: <RouteCard delegation={delegation} />,
          fullWidth: true,
        },
      ],
    },
    // Block B — driver + vehicle strip (fullWidth row in a full-span section).
    {
      title: tSections('vehicleAndDriver'),
      icon: User,
      span: 'full',
      rows: [
        {
          label: tSections('vehicleAndDriver'),
          value: <DriverVehicleStrip delegation={delegation} />,
          fullWidth: true,
        },
      ],
    },
    // Block C — «STATUS I AUDYT» standard label/value <dl> section.
    {
      title: tSections('audit'),
      icon: ClipboardCheck,
      span: 'full',
      rows: [
        // Actual return date — only present once the outing has returned
        // (status `zjechal`); the planned return lives in the RouteCard above.
        ...(delegation.actualReturnAt
          ? [
              {
                label: tForm('actualReturnAt'),
                // Date-only — the weryfikator sets no return TIME (§E1 fix).
                value: dateValue(delegation.actualReturnAt),
              },
            ]
          : []),
        {
          label: tForm('reportedBy'),
          value: textValue(
            delegation.reportedBy?.name ?? delegation.reportedBy?.login,
          ),
        },
        {
          label: tForm('reportedAt'),
          value: dateTimeValue(delegation.reportedAt),
        },
        // «Zweryfikowany» reflects the EKSPORT who marked the outing `gotowy`
        // (readyBy/readyAt) — in MAGTRANS readying the load IS the verification
        // step. (Was verifiedBy/At from the in-transit stamp — §E2/E3.)
        {
          label: tForm('verifiedBy'),
          value: textValue(
            delegation.readyBy?.name ?? delegation.readyBy?.login,
          ),
        },
        {
          label: tForm('verifiedAt'),
          value: dateTimeValue(delegation.readyAt),
        },
        {
          label: tForm('notes'),
          value: (
            <>
              <span className={`${STRIP_MINI_LABEL} mb-1 block`}>
                {tForm('notes')}
              </span>
              {textValue(delegation.notes)}
            </>
          ),
          // Long free-text spans the section, no label gutter (§6.20). The
          // sr-only <dt> keeps the «Notatki» label for SR users; the visible
          // inline caption above repeats it for sighted users.
          fullWidth: true,
        },
      ],
    },
  ];

  // Block D — «Przebieg w trakcie wyjazdu» km-calendar (§7.7.9). A 4th body
  // section, fullWidth, AFTER «STATUS I AUDYT». Omitted entirely when the
  // delegation has no resolvable vehicle (per §6.4 "empty section omitted").
  // When a vehicle IS attached but no km rows fall in the window, the calendar
  // renders all-`empty` tiles + a «brak danych» caption (handled inside the
  // component) — informative, so it is shown rather than omitted. The km query
  // lives inside <DelegationKmCalendar>, gated on the vehicleId, so non-carrier
  // contexts (planista/dyspozytor reusing this modal) get the same read-only
  // window without extra wiring and without breaking those contexts.
  if (delegation.vehicleId) {
    sections.push({
      title: tKmCal('title'),
      icon: Gauge,
      span: 'full',
      rows: [
        {
          label: tKmCal('title'),
          value: <DelegationKmCalendar delegation={delegation} />,
          fullWidth: true,
        },
      ],
    });
  }

  // Block E — «ZESPÓŁ PROWADZĄCY» (§7.9.7). A `span:'full'` block AFTER the
  // km-calendar, so the reading order ends with "who is steering this trip".
  // The header deliberately mirrors the Google Chat trip-notification heading.
  //
  // Shows the CURRENT `Vehicle.dispatchTeam` (live, not a snapshot). Omitted
  // entirely when there is no resolvable vehicle (per §6.4 "empty section
  // omitted"). When the vehicle exists but carries no team → the «Brak zespołu
  // prowadzącego» amber box.
  //
  // NOTE: until the DelegationDto vehicle mini is widened with `dispatchTeam`
  // (api follow-up), `currentTeam` is `undefined` and the block is omitted —
  // it lights up automatically once the field lands. When the field IS present
  // but `null`, the "no team" amber box renders.
  const currentTeam = delegation.vehicleId
    ? readVehicleDispatchTeam(delegation)
    : undefined;
  if (delegation.vehicleId && currentTeam !== undefined) {
    sections.push({
      title: tTeam('leadingTeamHeader'),
      icon: Users,
      span: 'full',
      rows: [
        {
          label: tTeam('leadingTeamHeader'),
          value: currentTeam ? (
            <TeamMembers team={currentTeam} variant="list" size="md" />
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-bold text-warning">
              <AlertTriangle size={12} aria-hidden="true" />
              {tTeam('noTeam')}
            </div>
          ),
          fullWidth: true,
        },
        // Eksport grouped with the dispatchers — the staff steering this outing.
        // Same person shown as «Zweryfikowany przez» above (readyBy).
        {
          label: tTeam('eksport'),
          value: textValue(
            delegation.readyBy?.name ?? delegation.readyBy?.login,
          ),
        },
      ],
    });
  }

  // ── Footer meta line — created / updated timestamps (§6.6) ──────────
  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(delegation.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(delegation.updatedAt)}
    </>
  );

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      // Single-column route view reads better narrower than the dense 2-col
      // field grids the default `max-w-5xl` exists for (§6.4.1).
      className="max-w-2xl"
      title={
        <span className="font-mono">
          {delegation.vehicle?.plateNumber ?? t('title')}
        </span>
      }
      // Subtitle omitted — the driver moved into Block B (§6.4.1 header change).
      subtitle={undefined}
      badges={badges}
      sections={sections}
      meta={meta}
    />
  );
}
