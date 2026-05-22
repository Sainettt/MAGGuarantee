'use client';

// Phase 6 — DriverDetailModal. A thin, entity-specific wrapper that maps a
// DriverDto into the generic <EntityDetailModal> props (docs/14-design-system.md
// §6.9, §6.16). The generic shell is NOT re-implemented here.
//
// DriverSheet has a FLAT layout (no FormSections), so there is no Sheet order
// to mirror 1:1. Instead the fields are grouped into three clean logical
// sections — personal/contact · license · assignment — keyed off the
// `drivers.sections.*` i18n keys.
//
// Formatting reuses the shared helpers in components/ui/entity-detail-values.tsx
// and lib/format/numbers.ts — no duplicated Intl wrappers.

import { CreditCard, User, UserCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { DriverDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import {
  EntityDetailModal,
  type EntityDetailSection,
} from '@/components/ui/EntityDetailModal';
import {
  dateValue,
  monoValue,
  textValue,
} from '@/components/ui/entity-detail-values';
import { formatDateTime } from '@/lib/format/numbers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: DriverDto | null;
  /** Forwarded to the generic «Edytuj» action — the page opens DriverSheet. */
  onEdit: () => void;
}

export function DriverDetailModal({
  open,
  onOpenChange,
  driver,
  onEdit,
}: Props) {
  const t = useTranslations('drivers');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('entityDetail');

  // The modal is only rendered with a target; bail defensively so the hooks
  // above still run unconditionally (rules-of-hooks safe).
  if (!driver) return null;

  const f = (key: string) => t(`fields.${key}`);

  // ── Header badge row — only the status badge (no onboarding chips) ──
  const badges: ReactNode = driver.active ? (
    <Badge variant="success">{tCommon('active')}</Badge>
  ) : (
    <Badge variant="muted">{tCommon('inactive')}</Badge>
  );

  // ── 3 logical sections — DriverSheet has no FormSections to mirror ───
  const sections: EntityDetailSection[] = [
    {
      title: t('sections.personal'),
      icon: User,
      rows: [
        { label: f('firstName'), value: textValue(driver.firstName) },
        { label: f('lastName'), value: textValue(driver.lastName) },
        { label: f('phone'), value: textValue(driver.phone) },
        { label: f('phone2'), value: textValue(driver.phone2) },
        { label: f('email'), value: textValue(driver.email) },
      ],
    },
    {
      title: t('sections.license'),
      icon: CreditCard,
      rows: [
        {
          label: f('driverLicenseNumber'),
          value: monoValue(driver.driverLicenseNumber),
        },
        { label: f('licenseExpiry'), value: dateValue(driver.licenseExpiry) },
      ],
    },
    {
      title: t('sections.assignment'),
      icon: UserCog,
      rows: [
        {
          label: f('carrier'),
          value: textValue(driver.carrier?.name ?? driver.carrier?.login),
        },
        { label: f('notes'), value: textValue(driver.notes) },
      ],
    },
  ];

  // ── Footer meta line — created / updated timestamps (§6.6) ──────────
  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(driver.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(driver.updatedAt)}
    </>
  );

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${driver.firstName} ${driver.lastName}`.trim()}
      subtitle={
        <span className="font-mono">
          {driver.driverLicenseNumber || driver.loginSlug}
        </span>
      }
      badges={badges}
      sections={sections}
      meta={meta}
      onEdit={onEdit}
    />
  );
}
