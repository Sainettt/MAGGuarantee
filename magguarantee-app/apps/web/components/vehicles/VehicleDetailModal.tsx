'use client';

// Phase 6 — VehicleDetailModal. A thin, entity-specific wrapper that maps a
// VehicleDto into the generic <EntityDetailModal> props (docs/14-design-system.md
// §6.9, §6.15). The generic shell is NOT re-implemented here.
//
// The section order mirrors VehicleSheet's six FormSections so the read-only
// view and the edit Sheet feel like the same object:
//   Identyfikacja · Przypisanie · Wyposażenie · Stawki · Pozwolenia · Kraje.
// A seventh «Załączniki» section lists umowa/cabotage attachment file names
// (read-only, no download — v1 per the spec).
//
// Formatting reuses the shared helpers in components/ui/entity-detail-values.tsx
// and lib/format/numbers.ts — no duplicated Intl wrappers.

import {
  Banknote,
  FileText,
  Globe2,
  Package,
  ShieldCheck,
  Truck,
  UserCog,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { VehicleDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  boolValue,
  dateValue,
  emptyValue,
  listValue,
  monoValue,
  textValue,
} from '@/components/ui/entity-detail-values';
import { formatDateTime, formatEur } from '@/lib/format/numbers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: VehicleDto | null;
  /** Forwarded to the generic «Edytuj» action — the page opens VehicleSheet. */
  onEdit: () => void;
}

export function VehicleDetailModal({
  open,
  onOpenChange,
  vehicle,
  onEdit,
}: Props) {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('entityDetail');

  // The modal is only rendered with a target; bail defensively so the hooks
  // above still run unconditionally (rules-of-hooks safe).
  if (!vehicle) return null;

  const f = (key: string) => t(`fields.${key}`);
  const yes = tCommon('yes');
  const no = tCommon('no');
  const bool = (v: boolean | null | undefined) => boolValue(v, yes, no);

  // ── Header badge row — only the status badge (no onboarding chips) ──
  const badges: ReactNode = vehicle.active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );

  // ── Subtitle — brand + model, falling back to the carrier name ──────
  const brandModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');
  const subtitle =
    brandModel ||
    vehicle.carrier?.name ||
    vehicle.carrier?.login ||
    undefined;

  /** €/km rate — `formatEur` already renders its own em-dash for null. */
  const rateValue = (v: number | null | undefined): ReactNode => (
    <span className="tabular-nums">{formatEur(v)}</span>
  );

  // ── 6 + 1 sections — mirrors the VehicleSheet FormSection order ──────
  const sections: EntityDetailSection[] = [
    {
      title: t('sections.identification'),
      icon: Truck,
      rows: [
        { label: f('plateNumber'), value: monoValue(vehicle.plateNumber) },
        { label: f('sideNumber'), value: textValue(vehicle.sideNumber) },
        { label: f('brand'), value: textValue(vehicle.brand) },
        { label: f('model'), value: textValue(vehicle.model) },
        {
          label: f('year'),
          value:
            vehicle.year != null ? (
              <span className="tabular-nums">{vehicle.year}</span>
            ) : (
              emptyValue()
            ),
        },
        // `type` (MEGA/STD/COIL) and `euro` (V/VI) are raw enum codes — the
        // form/table render them verbatim, so do the same here.
        { label: f('type'), value: textValue(vehicle.type) },
        { label: f('euro'), value: textValue(vehicle.euro) },
        { label: f('certificateL'), value: bool(vehicle.certificateL) },
        {
          label: f('nextInspectionDate'),
          value: dateValue(vehicle.nextInspectionDate),
        },
      ],
    },
    {
      title: t('sections.people'),
      icon: UserCog,
      rows: [
        {
          label: f('carrier'),
          value: textValue(
            vehicle.carrier?.name ?? vehicle.carrier?.login,
          ),
        },
        {
          label: f('planner'),
          value: textValue(
            vehicle.planner?.name ?? vehicle.planner?.login,
          ),
        },
        {
          label: f('dispatcher'),
          value: textValue(
            vehicle.dispatcher?.name ?? vehicle.dispatcher?.login,
          ),
        },
      ],
    },
    {
      title: t('sections.equipment'),
      icon: Package,
      rows: [
        { label: f('gps'), value: bool(vehicle.gps) },
        { label: f('gpsMobilePhone'), value: textValue(vehicle.gpsMobilePhone) },
        { label: f('fuelCard'), value: bool(vehicle.fuelCard) },
        { label: f('agreement'), value: bool(vehicle.agreement) },
      ],
    },
    {
      title: t('sections.rates'),
      icon: Banknote,
      rows: [
        { label: f('rateDe'), value: rateValue(vehicle.rateDe) },
        { label: f('rateUe'), value: rateValue(vehicle.rateUe) },
        { label: f('rateExport'), value: rateValue(vehicle.rateExport) },
        { label: f('rateImport'), value: rateValue(vehicle.rateImport) },
      ],
    },
    {
      title: t('sections.permissions'),
      icon: ShieldCheck,
      rows: [
        { label: f('adrClasses'), value: listValue(vehicle.adrClasses) },
        { label: f('wasteAllowed'), value: bool(vehicle.wasteAllowed) },
        { label: f('wasteCountries'), value: listValue(vehicle.wasteCountries) },
        { label: f('cabotageDe'), value: bool(vehicle.cabotageDe) },
        { label: f('cabotageFr'), value: bool(vehicle.cabotageFr) },
        { label: f('gb'), value: bool(vehicle.gb) },
        { label: f('it'), value: bool(vehicle.it) },
        { label: f('fr'), value: bool(vehicle.fr) },
      ],
    },
    {
      title: t('sections.countries'),
      icon: Globe2,
      rows: [
        {
          label: f('destinationCountries'),
          value: listValue(vehicle.destinationCountries),
        },
        { label: f('lastDroveAt'), value: dateValue(vehicle.lastDroveAt) },
        { label: f('notes'), value: textValue(vehicle.notes) },
      ],
    },
  ];

  // ── Attachments — list file names as plain text rows (read-only, no
  //    download in v1). Section is rendered only when files exist. ───────
  if (vehicle.attachments && vehicle.attachments.length > 0) {
    sections.push({
      title: t('sections.attachments'),
      icon: FileText,
      rows: vehicle.attachments.map((att) => ({
        label: textValue(att.category),
        value: textValue(att.fileName),
      })),
    });
  }

  // ── Footer meta line — created / updated timestamps (§6.6) ──────────
  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(vehicle.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(vehicle.updatedAt)}
    </>
  );

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={vehicle.plateNumber}
      subtitle={subtitle}
      badges={badges}
      sections={sections}
      meta={meta}
      onEdit={onEdit}
    />
  );
}
