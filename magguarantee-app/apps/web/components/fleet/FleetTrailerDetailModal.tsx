'use client';

// Phase 6.4 — <FleetTrailerDetailModal>. Read-only trailer detail modal for the
// planista + dyspozytor fleet tabs (docs/14-design-system.md §6.4.2). A thin
// wrapper over the generic <EntityDetailModal> — the shell is NOT re-implemented.
//
// Renders from the ENRICHED `TrailerListItem` the panel already holds — NO
// second fetch. Read-only: no `onEdit` ⇒ footer is «Zamknij» only (§6.6).
// Trailers carry no rates — nothing to exclude beyond the universal rule.
//
// Field-label i18n reuses `trailers.fields.*`; section titles come from
// `fleet.trailer.sections.*`. Dimension/capacity units live in the labels
// («(m)», «(t)»), so the values are bare numbers (same convention as §6.17).
// The slim item carries `trailerTypeName` flat (no `shortCode`), so the type
// is shown as-is. The «Wymiary» section is omitted when every dimension/
// capacity value is empty (§6.4 "Empty section").

import { Container, Package, Ruler } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { TrailerListItem } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  boolValue,
  emptyValue,
  monoValue,
  textValue,
} from '@/components/ui/entity-detail-values';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trailer: TrailerListItem | null;
}

export function FleetTrailerDetailModal({
  open,
  onOpenChange,
  trailer,
}: Props) {
  const tFields = useTranslations('trailers.fields');
  const tSections = useTranslations('fleet.trailer.sections');
  const tCommon = useTranslations('common');

  if (!trailer) return null;

  const yes = tCommon('yes');
  const no = tCommon('no');
  const bool = (v: boolean | null | undefined) => boolValue(v, yes, no);

  /** Bare numeric value (units live in the field label); em-dash when null. */
  const numValue = (v: number | null | undefined): ReactNode =>
    v != null ? <span className="tabular-nums">{v}</span> : emptyValue();

  /**
   * Boolean + optional count → `"Tak (N szt.)"` / `"Yes (N pcs.)"`; plain
   * "Tak"/"Yes" when the flag is true without a count; em-dash for a null flag.
   * Mirrors the admin TrailerDetailModal so belts/mats read identically.
   */
  const boolWithCount = (
    flag: boolean | null | undefined,
    count: number | null | undefined,
  ): ReactNode => {
    if (flag == null) return emptyValue();
    if (flag === false) return <span>{no}</span>;
    if (typeof count === 'number') {
      return (
        <span>
          {yes} ({count} {tCommon('pcsShort')})
        </span>
      );
    }
    return <span>{yes}</span>;
  };

  const badges: ReactNode = trailer.active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );

  const sections: EntityDetailSection[] = [
    {
      title: tSections('identification'),
      icon: Container,
      rows: [
        { label: tFields('plateNumber'), value: monoValue(trailer.plateNumber) },
        {
          label: tFields('trailerType'),
          value: textValue(trailer.trailerTypeName),
        },
      ],
    },
  ];

  // «Wymiary» — omit when every dimension/capacity value is empty.
  const hasDimensions =
    trailer.innerLength != null ||
    trailer.innerWidth != null ||
    trailer.innerHeight != null ||
    trailer.capacity != null;
  if (hasDimensions) {
    sections.push({
      title: tSections('dimensions'),
      icon: Ruler,
      rows: [
        { label: tFields('innerLength'), value: numValue(trailer.innerLength) },
        { label: tFields('innerWidth'), value: numValue(trailer.innerWidth) },
        { label: tFields('innerHeight'), value: numValue(trailer.innerHeight) },
        { label: tFields('capacity'), value: numValue(trailer.capacity) },
      ],
    });
  }

  sections.push({
    title: tSections('equipment'),
    icon: Package,
    // 7 rows including a free-text «Notatki» — too tall to pair (§6.17).
    span: 'full',
    rows: [
      {
        label: tFields('belts'),
        value: boolWithCount(trailer.belts, trailer.beltsCount),
      },
      {
        label: tFields('mats'),
        value: boolWithCount(trailer.mats, trailer.matsCount),
      },
      { label: tFields('airSuspension'), value: bool(trailer.airSuspension) },
      { label: tFields('certXl'), value: bool(trailer.certXl) },
      { label: tFields('multilock'), value: bool(trailer.multilock) },
      {
        label: tFields('notes'),
        value: textValue(trailer.notes),
        fullWidth: true,
      },
    ],
  });

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="font-mono">{trailer.plateNumber}</span>}
      subtitle={trailer.trailerTypeName || undefined}
      badges={badges}
      sections={sections}
    />
  );
}
