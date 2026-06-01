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

import { ClipboardCheck, Truck, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { DelegationDto } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { RouteCard } from '@/components/delegations/RouteCard';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import { emptyValue, textValue } from '@/components/ui/entity-detail-values';
import { formatDateTime } from '@/lib/format/numbers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delegation: DelegationDto | null;
}

/** "dd.MM.yyyy, HH:mm" rendered inside an em-dash-aware <dd>. */
function dateTimeValue(iso: string | null | undefined): ReactNode {
  return iso ? <span>{formatDateTime(iso)}</span> : emptyValue();
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
        {
          label: tForm('verifiedBy'),
          value: textValue(
            delegation.verifiedBy?.name ?? delegation.verifiedBy?.login,
          ),
        },
        {
          label: tForm('verifiedAt'),
          value: dateTimeValue(delegation.verifiedAt),
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
