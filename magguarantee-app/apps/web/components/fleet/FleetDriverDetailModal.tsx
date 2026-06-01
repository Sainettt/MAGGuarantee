'use client';

// Phase 6.4 — <FleetDriverDetailModal>. Read-only driver detail modal for the
// planista + dyspozytor fleet tabs (docs/14-design-system.md §6.4.2). A thin
// wrapper over the generic <EntityDetailModal> — the shell is NOT re-implemented.
//
// Renders from the ENRICHED `DriverListItem` the panel already holds — NO second
// fetch. Read-only: no `onEdit` ⇒ footer is «Zamknij» only (§6.6).
//
// HARD EXCLUSION (§6.4.2): never `bankAccount` (financial-adjacent) and never
// the `carrier` relation. Field-label i18n reuses `drivers.fields.*`; section
// titles come from `fleet.driver.sections.*`. The «Notatki» section is omitted
// entirely when `notes` is empty (§6.4 "Empty section").

import { CreditCard, StickyNote, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { DriverListItem } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  boolValue,
  dateValue,
  monoValue,
  textValue,
} from '@/components/ui/entity-detail-values';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: DriverListItem | null;
}

export function FleetDriverDetailModal({ open, onOpenChange, driver }: Props) {
  const tFields = useTranslations('drivers.fields');
  const tSections = useTranslations('fleet.driver.sections');
  const tCommon = useTranslations('common');

  if (!driver) return null;

  const yes = tCommon('yes');
  const no = tCommon('no');

  const badges: ReactNode = driver.active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );

  const sections: EntityDetailSection[] = [
    {
      title: tSections('personal'),
      icon: User,
      rows: [
        { label: tFields('firstName'), value: textValue(driver.firstName) },
        { label: tFields('lastName'), value: textValue(driver.lastName) },
        { label: tFields('phone'), value: textValue(driver.phone) },
        { label: tFields('phone2'), value: textValue(driver.phone2) },
        { label: tFields('email'), value: textValue(driver.email) },
      ],
    },
    {
      title: tSections('documents'),
      icon: CreditCard,
      rows: [
        {
          label: tFields('idDocumentNumber'),
          value: monoValue(driver.idDocumentNumber),
        },
        {
          label: tFields('licenseExpiry'),
          value: dateValue(driver.licenseExpiry),
        },
        { label: tFields('adr'), value: boolValue(driver.adr, yes, no) },
      ],
    },
  ];

  // «Notatki» — omit the whole section when empty (§6.4 "Empty section").
  if (driver.notes?.trim()) {
    sections.push({
      title: tSections('notes'),
      icon: StickyNote,
      span: 'full',
      rows: [
        {
          label: tFields('notes'),
          value: textValue(driver.notes),
          fullWidth: true,
        },
      ],
    });
  }

  const subtitle = driver.idDocumentNumber?.trim() ? (
    <span className="font-mono">{driver.idDocumentNumber}</span>
  ) : undefined;

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${driver.firstName} ${driver.lastName}`.trim()}
      subtitle={subtitle}
      badges={badges}
      sections={sections}
    />
  );
}
