'use client';

// Phase 6.4 — <FleetVehicleDetailModal>. Read-only vehicle detail modal for the
// planista + dyspozytor fleet tabs (docs/14-design-system.md §6.4.2). A thin
// wrapper over the generic <EntityDetailModal> — the shell is NOT re-implemented.
//
// It renders from the ENRICHED `VehicleListItem` the panel already holds (the
// /fleet/* query) — NO second fetch (same "no second fetch" rationale as §6.8).
// Read-only: no `onEdit` ⇒ footer is «Zamknij» only (§6.6).
//
// HARD EXCLUSION (§6.4.2): never any rate field (`rateDe`/`rateUe`/`rateExport`/
// `rateImport`) — planista/dyspozytor must not see pricing. The «Stawki» section
// from the admin §6.15 modal is dropped entirely here. The §6.15 «Przypisanie»
// (carrier/planner/dispatcher) section is also dropped — the panel is already
// scoped to the viewer's own fleet and the relations aren't in the slim item.
//
// Field-label i18n reuses `vehicles.fields.*`; section titles come from
// `fleet.vehicle.sections.*`. `gpsMobilePhone` is labelled «ID urządzenia GPS»
// (quirk #2 — the GPS tracker device ID, NEVER "telefon"); `lastDroveAt` is
// display-only (quirk #11).

import { Globe2, Package, ShieldCheck, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { VehicleListItem } from '@magguarantee/shared';

import { TeamFieldValue } from '@/components/teams/TeamFieldValue';
import { Badge } from '@/components/ui/Badge';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  boolValue,
  dateValue,
  listValue,
  monoValue,
  textValue,
} from '@/components/ui/entity-detail-values';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: VehicleListItem | null;
}

export function FleetVehicleDetailModal({
  open,
  onOpenChange,
  vehicle,
}: Props) {
  const tFields = useTranslations('vehicles.fields');
  const tVehicles = useTranslations('vehicles');
  const tSections = useTranslations('fleet.vehicle.sections');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('entityDetail');

  if (!vehicle) return null;

  const yes = tCommon('yes');
  const no = tCommon('no');
  const bool = (v: boolean | null | undefined) => boolValue(v, yes, no);

  const badges: ReactNode = vehicle.active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );

  const sections: EntityDetailSection[] = [
    {
      title: tSections('identification'),
      icon: Truck,
      rows: [
        { label: tFields('plateNumber'), value: monoValue(vehicle.plateNumber) },
        { label: tFields('sideNumber'), value: textValue(vehicle.sideNumber) },
        // `type` (MEGA/STD/COIL) and `euro` (V/VI) are raw enum codes.
        { label: tFields('type'), value: textValue(vehicle.type) },
        { label: tFields('euro'), value: textValue(vehicle.euro) },
        { label: tFields('certificateL'), value: bool(vehicle.certificateL) },
      ],
    },
    {
      title: tSections('equipment'),
      icon: Package,
      rows: [
        {
          // Quirk #2 — the GPS tracker device ID, NEVER "telefon". The `gps`
          // on/off boolean was dropped (every vehicle is tracked).
          label: tDetail('gpsDeviceId'),
          value: monoValue(vehicle.gpsMobilePhone),
        },
        {
          label: tFields('fuelCard'),
          value: (
            <span className="flex flex-wrap items-center gap-2">
              {bool(vehicle.fuelCard)}
              {vehicle.fuelCard &&
                (vehicle.fuelCardBlocked ? (
                  <Badge variant="danger">{tVehicles('fuelCardStatus.blocked')}</Badge>
                ) : (
                  <Badge variant="success">{tVehicles('fuelCardStatus.active')}</Badge>
                ))}
            </span>
          ),
        },
        {
          label: tFields('agreement'),
          value: (
            <span className="flex flex-wrap items-center gap-2">
              {bool(vehicle.agreement)}
              {vehicle.agreementScanMissing && (
                <Badge variant="warning">
                  {tVehicles('agreementScanMissing')}
                </Badge>
              )}
            </span>
          ),
        },
      ],
    },
    {
      title: tSections('permissions'),
      icon: ShieldCheck,
      // 8 rows — too tall to pair in the 2-col grid.
      span: 'full',
      rows: [
        { label: tFields('adr'), value: bool(vehicle.adr) },
        { label: tFields('wasteAllowed'), value: bool(vehicle.wasteAllowed) },
        {
          label: tFields('wasteCountries'),
          value: listValue(vehicle.wasteCountries),
        },
        { label: tFields('cabotageDe'), value: bool(vehicle.cabotageDe) },
        { label: tFields('cabotageFr'), value: bool(vehicle.cabotageFr) },
        // gb/it/fr are country access permits, NOT language codes (quirk #3).
        { label: tFields('gb'), value: bool(vehicle.gb) },
        { label: tFields('it'), value: bool(vehicle.it) },
        { label: tFields('fr'), value: bool(vehicle.fr) },
      ],
    },
    {
      title: tSections('usage'),
      icon: Globe2,
      span: 'full',
      rows: [
        // Quirk #11 — display-only, never editable; fine to show here.
        { label: tFields('lastDroveAt'), value: dateValue(vehicle.lastDroveAt) },
        // Phase 11 — dispatch-team composition (non-sensitive — no rates, so
        // not blocked by the §6.4.2 HARD EXCLUSION). The slim VehicleListItem
        // now carries `dispatchTeam`, so the read-only panel shows it too.
        {
          label: tFields('dispatchTeam'),
          value: (
            <TeamFieldValue
              team={vehicle.dispatchTeam}
              label={tFields('dispatchTeam')}
            />
          ),
          fullWidth: true,
        },
        {
          label: tFields('notes'),
          value: textValue(vehicle.notes),
          fullWidth: true,
        },
      ],
    },
  ];

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="font-mono">{vehicle.plateNumber}</span>}
      badges={badges}
      sections={sections}
    />
  );
}
