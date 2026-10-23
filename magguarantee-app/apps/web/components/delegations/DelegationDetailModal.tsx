'use client';

// Phase 3 / redesigned Phase 6.4 — DelegationDetailModal. A thin, entity-
// specific wrapper that maps a DelegationDto into the generic
// <EntityDetailModal> props (docs/14-design-system.md §6.4.1). The generic
// shell is NOT re-implemented here.
//
// Layout (§6.4.1 + §6.4.1a lifecycle-presentation redesign 2026-07-07):
//   Header  — title = vehicle plate (mono) + status badge ONLY (no subtitle).
//   Block A — <RouteCard> (span:'full', fullWidth row): departure circle →
//             truck + planned-duration pill → return circle. Each end now
//             carries a reported-vs-actual date pair (§6.4.1a) — the actual
//             departure/return dates fold in HERE, not in the audit chain.
//   «Stawki» — vehicle rates strip (span:'full', fullWidth row — §6.4.1,
//             positional insert 2026-07-17 BETWEEN Block A and Block B; the
//             existing A/B/C/D letters are NOT re-lettered, it is referenced
//             by name). A 4-up tile grid of the delegation vehicle's live
//             km-guarantee rates (Stawka DE/UE/eksport/import). Two-layer
//             gate: hidden for `dyspozytor` (server ALSO scrubs the four
//             fields to null) and omitted when the vehicle is absent or all
//             four rates are null (§6.4 "empty section omitted").
//   Block B — driver + vehicle strip (span:'full', fullWidth row): driver
//             name + phone | NR REJ. + Naczepa <plate>.
//   Block C — «Historia statusu» (§6.4.1a): a vertical 3-step audit STEPPER
//             (registered/carrier → accepted/eksport → confirmed-in-transit/
//             weryfikator), success/border dots + «— oczekuje» pending caption.
//             Only actor + timestamp live here (operational actuals moved to A).
//   Block D — «Notatki» (§6.4.1a): its own span:'full' long-text section;
//             omitted entirely when notes is empty.
//   Footer  — «Utworzono {createdAt}» meta + «Zamknij» (read-only — no onEdit).
//
// All DelegationDto fields are accounted for (see the §6.4.1/§6.4.1a mapping).
// The §6.4.1a redesign SURFACES the real weryfikator `verifiedBy/At` stamp
// (step 3, previously never rendered) and stops mislabelling the eksport
// `readyBy/At` stamp as «Zweryfikowany». The modal width is overridden to
// `max-w-[820px]` — roomier than the base 2xl for the reported-vs-actual date
// pairs + stepper, but still narrower than the dense 2-column field grids that
// the default `max-w-5xl` width exists for.
//
// Read-only consumer everywhere (carrier list, planista/dyspozytor Wyjazdy
// rows) — no `onEdit` is passed, so the footer shows only «Zamknij» (§6.6).

import {
  AlertTriangle,
  Banknote,
  ClipboardCheck,
  Gauge,
  StickyNote,
  Truck,
  User,
  Users,
} from 'lucide-react';
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
  type EntityDetailRow,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import { textValue } from '@/components/ui/entity-detail-values';
import { formatDateTime, formatEur } from '@/lib/format/numbers';
import { useCan } from '@/lib/hooks/useCan';

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

/**
 * The «Stawki» rates strip (§6.4.1 — positional insert between Block A «Trasa»
 * and Block B «Pojazd i kierowca», 2026-07-17). A 4-up tile grid of the
 * delegation vehicle's LIVE km-guarantee rates (Stawka DE/UE/eksport/import),
 * EUR-formatted with `formatEur` (renders its own em-dash for null). Reuses the
 * §6.15 vehicle «Stawki» presentation (icon + i18n) on the delegation surface.
 *
 * Fields come straight off the shared `DelegationDto.vehicle` mini (which now
 * carries the four rates) — NO defensive cast. Role/data gating (dyspozytor-omit
 * + at-least-one-non-null) lives at the call site; this only renders. Fills the
 * shell's section card (§6.20 pattern) — no own border/padding, same as the
 * other fullWidth strips.
 */
function RatesStrip({
  vehicle,
}: {
  vehicle: NonNullable<DelegationDto['vehicle']>;
}) {
  const tField = useTranslations('vehicles.fields');

  const tiles: { label: string; value: number | null }[] = [
    { label: tField('rateDe'), value: vehicle.rateDe },
    { label: tField('rateUe'), value: vehicle.rateUe },
    { label: tField('rateExport'), value: vehicle.rateExport },
    { label: tField('rateImport'), value: vehicle.rateImport },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex flex-col gap-1">
          <span className={STRIP_MINI_LABEL}>{tile.label}</span>
          {/* Mirrors VehicleDetailModal's `rateValue` helper — formatEur +
              tabular-nums so values align across the strip. */}
          <span className="text-sm font-semibold tabular-nums text-text">
            {formatEur(tile.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A single audit-actor shape shared by all three lifecycle steps. */
type StatusActor = { name: string | null; login: string } | null | undefined;

interface StatusStep {
  /** Localized action label, e.g. «Zgłoszony przez». */
  label: string;
  /** The user who performed the transition (or null when not-yet-reached). */
  actor: StatusActor;
  /** The transition timestamp — genuine datetime, or null when un-fired. */
  at: string | null;
}

/**
 * «Historia statusu» — the delegation lifecycle audit chain (§6.4.1a Block C),
 * rendered as a vertical stepper (three ordered events top-to-bottom):
 * registered (carrier) → accepted (eksport) → confirmed-in-transit
 * (weryfikator). The ordering carries meaning, so this is a stepper, NOT a
 * two-column <dl>.
 *
 * Per step: a status dot (`bg-success` once stamped, `bg-border` when not-yet-
 * reached) sitting on a hairline spine, then the action label + actor name, and
 * a right-aligned timestamp. Un-fired steps 2/3 render greyed with a «— oczekuje»
 * pending caption (they are NOT hidden — the chain communicates progress). Step
 * 1 (`reportedAt`) is always populated. `anulowany` outings simply leave the
 * un-fired steps pending (no invented cancel step — §6.4.1a).
 *
 * Presentation-only + role-neutral: shared read-only across carrier / planista /
 * dyspozytor / eksport / weryfikator; no role gains or loses visibility.
 */
function StatusHistoryStepper({ steps }: { steps: StatusStep[] }) {
  const tAudit = useTranslations('carrier.delegations.audit');

  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const done = step.at != null;
        const isLast = i === steps.length - 1;
        const actorName = done ? (step.actor?.name ?? step.actor?.login) : null;

        return (
          <li key={step.label} className="flex gap-3">
            {/* Spine — dot + connecting hairline to the next step. */}
            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  done ? 'bg-success' : 'bg-border'
                }`}
                aria-hidden="true"
              />
              {!isLast && (
                <span
                  className="w-px flex-1 bg-border"
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Action label + actor | right-aligned timestamp. Trailing gap on
                all but the last step keeps the spine hairline running between
                dots without dangling space after the final step. */}
            <div
              className={`flex min-w-0 flex-1 items-start justify-between gap-3 ${
                isLast ? '' : 'pb-4'
              }`}
            >
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    done ? 'text-text' : 'text-text-sub'
                  }`}
                >
                  {step.label}
                </p>
                {done ? (
                  <p className="truncate text-xs text-text-sub">
                    {actorName || '—'}
                  </p>
                ) : (
                  <p className="text-xs text-text-sub">{tAudit('pending')}</p>
                )}
              </div>
              {done && (
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-text-sub">
                  {formatDateTime(step.at)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DelegationDetailModal({
  open,
  onOpenChange,
  delegation,
}: Props) {
  const t = useTranslations('carrier.delegations');
  const tSections = useTranslations('carrier.delegations.sections');
  const tAudit = useTranslations('carrier.delegations.audit');
  const tDetail = useTranslations('entityDetail');
  const tKmCal = useTranslations('delegation.kmCalendar');
  const tTeam = useTranslations('team');
  const tRates = useTranslations('vehicles.sections');
  // Viewer permission — drives the «Stawki» UI gate (§6.4.1). Called
  // unconditionally at the top (rules-of-hooks safe), before the null bail
  // below. False while `/auth/me` loads.
  const canReadRates = useCan('vehicles.rates.read');

  // The modal is only rendered with a target; bail defensively so the hooks
  // above still run unconditionally (rules-of-hooks safe).
  if (!delegation) return null;

  // ── «Stawki» visibility gate (§6.4.1 — two conditions, both required) ────
  //   1. Viewer permission `vehicles.rates.read`: every delegation-reading
  //      role holds it EXCEPT dyspozytor (whose rates the server ALSO scrubs
  //      to null — this is the 2nd layer).
  //   2. Data: a resolvable vehicle AND at least one non-null rate (per §6.4
  //      "empty section omitted" — no all-em-dash block). Read straight off the
  //      shared mini — no defensive cast (unlike `readVehicleDispatchTeam`,
  //      which predated its field).
  const ratesVehicle = delegation.vehicle;
  const showRates =
    canReadRates &&
    ratesVehicle != null &&
    (ratesVehicle.rateDe != null ||
      ratesVehicle.rateUe != null ||
      ratesVehicle.rateExport != null ||
      ratesVehicle.rateImport != null);

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
    // «Stawki» — vehicle rates strip (§6.4.1, positional insert 2026-07-17
    // BETWEEN Block A «Trasa» and Block B «Pojazd i kierowca»; A/B/C/D letters
    // are NOT re-numbered — referenced by name). A full-span section holding a
    // single fullWidth 4-up tile strip. Spread-in only when `showRates` (the
    // dyspozytor-omit + at-least-one-rate gate above), preserving this position
    // — NOT pushed to the end. `showRates && ratesVehicle` narrows the vehicle
    // to non-null for <RatesStrip> with no cast.
    ...(showRates && ratesVehicle
      ? [
          {
            title: tRates('rates'),
            icon: Banknote,
            span: 'full',
            rows: [
              {
                label: tRates('rates'),
                value: <RatesStrip vehicle={ratesVehicle} />,
                fullWidth: true,
              },
            ],
          } satisfies EntityDetailSection,
        ]
      : []),
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
    // Block C — «Historia statusu» lifecycle audit chain (§6.4.1a). A vertical
    // stepper (registered → accepted/eksport → confirmed-in-transit/weryfikator),
    // NOT a flat <dl>: the ordering carries meaning. Operational actuals
    // (`actualReturnAt`, `actualDepartureAt`) now live in the RouteCard above —
    // only actor + timestamp stamps live here. The three stamps are ALL genuine
    // datetimes → `dateTimeValue` (inside the stepper). `createdAt`/`updatedAt`
    // stay in the footer meta line — they are NOT stepper rows (§6.4.1a).
    {
      title: tSections('audit'),
      icon: ClipboardCheck,
      span: 'full',
      rows: [
        {
          label: tSections('audit'),
          value: (
            <StatusHistoryStepper
              steps={[
                // Step 1 — carrier registered the zgłoszenie. Always populated
                // (`reportedAt` is non-nullable on the DTO).
                {
                  label: tAudit('registeredBy'),
                  actor: delegation.reportedBy,
                  at: delegation.reportedAt,
                },
                // Step 2 — eksport readied the load (`zgloszony → gotowy`).
                // Honestly labelled «Zaakceptowany (eksport)» — this is the
                // readyBy/At stamp (was mislabelled «Zweryfikowany»).
                {
                  label: tAudit('readiedBy'),
                  actor: delegation.readyBy,
                  at: delegation.readyAt,
                },
                // Step 3 — weryfikator confirmed departure (`gotowy → w_trasie`).
                // Surfaces the REAL verifiedBy/At stamp (previously invisible).
                {
                  label: tAudit('confirmedInTransit'),
                  actor: delegation.verifiedBy,
                  at: delegation.verifiedAt,
                },
              ]}
            />
          ),
          // Bespoke stepper block spans the section, no label gutter (§6.20).
          fullWidth: true,
        },
        // «Nr zlecenia ze spedu» — the SpedTrans order number captured by
        // eksport at the załadowany (readyBy) step above. A plain labelled
        // field, rendered only when present (per §6.4 "empty section omitted").
        ...(delegation.spedOrderNumber
          ? [
              {
                label: tAudit('spedOrderNumber'),
                value: textValue(delegation.spedOrderNumber),
              } satisfies EntityDetailRow,
            ]
          : []),
      ],
    },
  ];

  // Block D — «Notatki» (§6.4.1a). Its own `span:'full'` long-text section
  // (§6.20). Omitted entirely when notes is empty (per §6.4 "empty section
  // omitted") — no dangling «Notatki: —».
  if (delegation.notes?.trim()) {
    sections.push({
      title: tSections('notes'),
      icon: StickyNote,
      span: 'full',
      rows: [
        {
          // sr-only <dt> caption for SR users; the section header carries the
          // visible «Notatki» label (§6.20 fullWidth long-text).
          label: tSections('notes'),
          value: textValue(delegation.notes),
          fullWidth: true,
        },
      ],
    });
  }

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
        // Planista — the snapshot of the trip period (docs/29 R5,
        // `delegation.planner`), NOT the vehicle's live planista: after a
        // transfer a `w_trasie` trip is still led by the previous one (R6).
        // When they differ, one quiet line names who plans the vehicle now
        // (docs/14 §17.8) — otherwise that case would look like an error.
        {
          label: tTeam('planista'),
          value: (() => {
            const tripPlanner = delegation.planner;
            const nowPlanner = delegation.vehicle?.planner ?? null;
            const showNow =
              tripPlanner !== null &&
              nowPlanner !== null &&
              tripPlanner.id !== nowPlanner.id;
            return (
              <span className="flex flex-col gap-0.5">
                <span>{textValue(tripPlanner?.name ?? tripPlanner?.login)}</span>
                {showNow ? (
                  <span className="text-xs text-text-sub">
                    {tTeam('planistaNow', {
                      name: nowPlanner.name ?? nowPlanner.login,
                    })}
                  </span>
                ) : null}
              </span>
            );
          })(),
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
      // Single-column route view: ~820px — roomier than the base 2xl for the
      // reported-vs-actual date pairs + stepper, but still narrower than the
      // dense 2-col field grids the default `max-w-5xl` exists for (§6.4.1).
      className="max-w-[820px]"
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
