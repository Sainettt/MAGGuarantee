'use client';

// Phase 6 — TrailerDetailModal. A thin, entity-specific wrapper that maps a
// TrailerDto into the generic <EntityDetailModal> props (docs/14-design-system.md
// §6.9, §6.17). The generic shell is NOT re-implemented here.
//
// The section order mirrors TrailerSheet's three FormSections so the read-only
// view and the edit Sheet feel like the same object:
//   Identyfikacja · Wymiary · Wyposażenie.
// Dimension/capacity units come baked into the field labels themselves
// (`innerLength` → "Długość wewn. (m)", `capacity` → "Ładowność (t)"), exactly
// as the TrailerSheet form renders them — so the values are bare numbers.
//
// Formatting reuses the shared helpers in components/ui/entity-detail-values.tsx
// and lib/format/numbers.ts — no duplicated Intl wrappers.

import { Container, Package, Ruler } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { TrailerDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  boolValue,
  dateValue,
  emptyValue,
  textValue,
} from '@/components/ui/entity-detail-values';
import { formatDateTime } from '@/lib/format/numbers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trailer: TrailerDto | null;
  /** Forwarded to the generic «Edytuj» action — the page opens TrailerSheet.
   *  Omit it for read-only consumers: the «Edytuj» button is then not
   *  rendered (§6.6). */
  onEdit?: () => void;
}

export function TrailerDetailModal({
  open,
  onOpenChange,
  trailer,
  onEdit,
}: Props) {
  const t = useTranslations('trailers');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('entityDetail');

  // The modal is only rendered with a target; bail defensively so the hooks
  // above still run unconditionally (rules-of-hooks safe).
  if (!trailer) return null;

  const f = (key: string) => t(`fields.${key}`);
  const yes = tCommon('yes');
  const no = tCommon('no');
  const bool = (v: boolean | null | undefined) => boolValue(v, yes, no);

  /**
   * Boolean + optional count. When the flag is true and we have a numeric
   * count, render `"Tak (N szt.)"` (PL) / `"Yes (N pcs.)"` (EN); when the flag
   * is true without a count, fall back to plain "Tak"/"Yes"; null flag → em
   * dash. Inlined here rather than promoted to a shared helper because no
   * other entity-detail pairs a boolean with a count (per task brief).
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

  // ── Header badge row — only the status badge (no onboarding chips) ──
  const badges: ReactNode = trailer.active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );

  /** Bare numeric value (units live in the field label); em-dash when null. */
  const numValue = (v: number | null | undefined): ReactNode =>
    v != null ? <span className="tabular-nums">{v}</span> : emptyValue();

  // ── 3 sections — mirrors the TrailerSheet FormSection order ──────────
  const sections: EntityDetailSection[] = [
    {
      title: t('sections.identification'),
      icon: Container,
      rows: [
        {
          label: f('carrier'),
          value: textValue(trailer.carrier?.name ?? trailer.carrier?.login),
        },
        { label: f('plateNumber'), value: textValue(trailer.plateNumber) },
        {
          label: f('trailerType'),
          // Trailer type — same `[shortCode] name` shape the table uses.
          value: trailer.trailerType
            ? textValue(
                trailer.trailerType.shortCode
                  ? `[${trailer.trailerType.shortCode}] ${trailer.trailerType.name}`
                  : trailer.trailerType.name,
              )
            : emptyValue(),
        },
        { label: f('brand'), value: textValue(trailer.brand) },
        { label: f('model'), value: textValue(trailer.model) },
        { label: f('year'), value: numValue(trailer.year) },
        {
          label: f('nextInspectionDate'),
          value: dateValue(trailer.nextInspectionDate),
        },
      ],
    },
    {
      title: t('sections.dimensions'),
      icon: Ruler,
      rows: [
        { label: f('innerLength'), value: numValue(trailer.innerLength) },
        { label: f('innerWidth'), value: numValue(trailer.innerWidth) },
        { label: f('innerHeight'), value: numValue(trailer.innerHeight) },
        { label: f('capacity'), value: numValue(trailer.capacity) },
      ],
    },
    {
      title: t('sections.equipment'),
      icon: Package,
      rows: [
        {
          label: f('belts'),
          value: boolWithCount(trailer.belts, trailer.beltsCount),
        },
        {
          label: f('mats'),
          value: boolWithCount(trailer.mats, trailer.matsCount),
        },
        { label: f('airSuspension'), value: bool(trailer.airSuspension) },
        { label: f('certXl'), value: bool(trailer.certXl) },
        { label: f('multilock'), value: bool(trailer.multilock) },
        { label: f('notes'), value: textValue(trailer.notes) },
      ],
    },
  ];

  // ── Footer meta line — created / updated timestamps (§6.6) ──────────
  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(trailer.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(trailer.updatedAt)}
    </>
  );

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={trailer.plateNumber}
      subtitle={trailer.trailerType?.shortCode ?? trailer.trailerType?.name}
      badges={badges}
      sections={sections}
      meta={meta}
      onEdit={onEdit}
    />
  );
}
