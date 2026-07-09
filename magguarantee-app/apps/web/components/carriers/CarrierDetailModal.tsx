'use client';

// Phase 6 — CarrierDetailModal. A thin, entity-specific wrapper that maps a
// CarrierDto into the generic <EntityDetailModal> props using the locked
// 5-section field mapping (docs/14-design-system.md §6.10):
//   Dane konta i kontakt · Dane firmy · Finanse · Pozwolenia · Przypisanie.
//
// The generic shell is NOT re-implemented here — this file only does the
// CarrierDto → props mapping: badge row, the 5 sections, the footer meta line,
// and forwarding onEdit to the page (which opens CarrierFormDialog).
//
// Formatting reuses the shared helpers in lib/format/numbers.ts (formatEur,
// formatDateTime) and the shared value-formatter helpers in
// components/ui/entity-detail-values.tsx — no duplicated Intl wrappers.

import { Banknote, Building2, FileBadge, User, UserCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { CarrierDto } from '@magguarantee/shared';

import { OnboardingMissingBadge } from '@/components/carriers/OnboardingMissingBadge';
import { Badge } from '@/components/ui/Badge';
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
import { formatDateTime, formatEur } from '@/lib/format/numbers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carrier: CarrierDto | null;
  /** Forwarded to the generic «Edytuj» action — the page opens CarrierFormDialog.
   *  Omit it for read-only consumers: the «Edytuj» button is then not
   *  rendered (§6.6). */
  onEdit?: () => void;
}

export function CarrierDetailModal({
  open,
  onOpenChange,
  carrier,
  onEdit,
}: Props) {
  const t = useTranslations('carriers');
  const tCommon = useTranslations('common');
  const tDetail = useTranslations('entityDetail');

  // The modal is only rendered with a target; bail defensively so the hooks
  // above still run unconditionally (rules-of-hooks safe).
  if (!carrier) return null;

  const f = (key: string) => t(`fields.${key}`);

  // ── Header badge row — status + onboarding chips (§6.3, §6.10) ──────
  const badges: ReactNode = (
    <>
      {carrier.active ? (
        <Badge variant="success">{tCommon('active')}</Badge>
      ) : (
        <Badge variant="muted">{tCommon('inactive')}</Badge>
      )}
      <OnboardingMissingBadge onboarding={carrier.onboarding} />
    </>
  );

  // ── Finance — payment terms as "{n} dni" (§6.5, §6.10) ──────────────
  const paymentTermsValue: ReactNode =
    carrier.paymentTerms != null ? (
      <span className="tabular-nums">
        {t('paymentTermsValue', { n: carrier.paymentTerms })}
      </span>
    ) : (
      emptyValue()
    );

  // ── 5 sections — mirrors the CarrierFormDialog FormSection order (§6.10) ──
  const sections: EntityDetailSection[] = [
    {
      title: t('sections.account'),
      icon: User,
      rows: [
        { label: f('login'), value: monoValue(carrier.login) },
        { label: f('email'), value: textValue(carrier.email) },
        { label: f('name'), value: textValue(carrier.name) },
        { label: f('contactPerson'), value: textValue(carrier.contactPerson) },
        { label: f('phone'), value: textValue(carrier.phone) },
        { label: f('ordersEmail'), value: textValue(carrier.ordersEmail) },
      ],
    },
    {
      title: t('sections.company'),
      icon: Building2,
      rows: [
        { label: f('nip'), value: monoValue(carrier.nip) },
        { label: f('vatId'), value: monoValue(carrier.vatId) },
        { label: f('company'), value: textValue(carrier.company) },
        { label: f('companyAddress'), value: textValue(carrier.companyAddress) },
      ],
    },
    {
      title: t('sections.finance'),
      icon: Banknote,
      rows: [
        { label: f('accountEur'), value: monoValue(carrier.accountEur) },
        { label: f('accountPln'), value: monoValue(carrier.accountPln) },
        { label: f('paymentTerms'), value: paymentTermsValue },
        {
          label: f('insuranceValue'),
          value: (
            <span className="tabular-nums">
              {formatEur(carrier.insuranceValue)}
            </span>
          ),
        },
        { label: f('insuranceExpiry'), value: dateValue(carrier.insuranceExpiry) },
        { label: f('licenseExpiry'), value: dateValue(carrier.licenseExpiry) },
      ],
    },
    {
      title: t('sections.permits'),
      icon: FileBadge,
      rows: [
        {
          label: f('numberOfVehicle'),
          value:
            carrier.numberOfVehicle != null ? (
              <span className="tabular-nums">{carrier.numberOfVehicle}</span>
            ) : (
              emptyValue()
            ),
        },
      ],
    },
    {
      title: t('sections.assignment'),
      icon: UserCog,
      rows: [
        {
          label: f('opiekun'),
          value: textValue(carrier.opiekun?.name ?? carrier.opiekun?.login),
        },
      ],
    },
  ];

  // ── Footer meta line — created / updated timestamps (§6.6) ──────────
  const meta: ReactNode = (
    <>
      {tDetail('createdAt')} {formatDateTime(carrier.createdAt)}
      {' · '}
      {tDetail('updatedAt')} {formatDateTime(carrier.updatedAt)}
    </>
  );

  return (
    <EntityDetailModal
      open={open}
      onOpenChange={onOpenChange}
      title={carrier.name ?? carrier.login}
      subtitle={<span className="font-mono">{carrier.login}</span>}
      badges={badges}
      sections={sections}
      meta={meta}
      onEdit={onEdit}
    />
  );
}
