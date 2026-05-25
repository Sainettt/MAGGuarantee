'use client';

// Phase 3 — DelegationDetailModal. A thin, entity-specific wrapper that maps
// a DelegationDto into the generic <EntityDetailModal> props (docs/14-design-system.md
// §6.9). The generic shell is NOT re-implemented here.
//
// The section order mirrors the three FormSections in the «Nowy wyjazd» form
// (`carrier/delegations/new`) so the read-only view and the submit form feel
// like the same object:
//   Pojazd i kierowca · Wyjazd · Powrót.
// A trailing «Status i audyt» section carries the system-managed fields that
// have no form input of their own (status, reportedBy/At, verifiedBy/At,
// notes, actualReturnAt).
//
// Read-only consumer (carrier viewing their own trip) — no `onEdit` is passed,
// so the footer shows only «Zamknij» (§6.6). The cancel action lives on the
// list row, not inside the modal.

import { Info, MapPin, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { DelegationDto } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  dateValue,
  emptyValue,
  monoValue,
  textValue,
} from '@/components/ui/entity-detail-values';
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

  // ── Header badge row — status only (matches the list column) ──────────
  const badges: ReactNode = <StatusBadge status={delegation.status} />;

  // ── Title + subtitle — vehicle plate as the headline, driver as the
  //    secondary identifier (mirrors the list's first two columns) ─────
  const driverFullName = delegation.driver
    ? `${delegation.driver.firstName} ${delegation.driver.lastName}`.trim()
    : delegation.driverNameSnapshot;

  const subtitle = driverFullName ?? undefined;

  // ── 3 sections mirroring the submit form, plus a trailing audit ──────
  const sections: EntityDetailSection[] = [
    {
      title: tSections('vehicleAndDriver'),
      icon: Truck,
      rows: [
        {
          label: tForm('vehicle'),
          value: monoValue(delegation.vehicle?.plateNumber),
        },
        {
          label: tForm('trailer'),
          value: monoValue(delegation.trailer?.plateNumber),
        },
        {
          label: tForm('driver'),
          value: textValue(driverFullName),
        },
        {
          label: tForm('driverPhone'),
          value: textValue(delegation.driverPhoneSnapshot),
        },
      ],
    },
    {
      title: tSections('departure'),
      icon: MapPin,
      rows: [
        {
          label: tForm('departureAt'),
          value: dateTimeValue(delegation.departureAt),
        },
        {
          label: tForm('departureCountry'),
          value: textValue(delegation.departureCountry),
        },
        {
          label: tForm('departurePostalCode'),
          value: monoValue(delegation.departurePostalCode),
        },
      ],
    },
    {
      title: tSections('return'),
      icon: MapPin,
      rows: [
        {
          label: tForm('plannedReturnAt'),
          value: dateValue(delegation.plannedReturnAt),
        },
        {
          label: tForm('returnCountry'),
          value: textValue(delegation.returnCountry),
        },
        {
          label: tForm('returnPostalCode'),
          value: monoValue(delegation.returnPostalCode),
        },
        {
          label: tForm('actualReturnAt'),
          value: dateTimeValue(delegation.actualReturnAt),
        },
      ],
    },
    {
      title: tSections('audit'),
      icon: Info,
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
          value: textValue(delegation.notes),
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
      title={
        <span className="font-mono">
          {delegation.vehicle?.plateNumber ?? t('title')}
        </span>
      }
      subtitle={subtitle}
      badges={badges}
      sections={sections}
      meta={meta}
    />
  );
}
