// Phase 3.2 — onboarding-step pill rendered in the carriers DataTable.
//
// Returns `null` for `COMPLETE` carriers — 95%+ of rows are healthy so the
// absence-of-badge becomes the implicit "all good" signal. Three pending
// variants share the warning-orange surface and differ only by Lucide icon +
// PL label (icon + word do the disambiguation, not color).
//
// Per docs/14-design-system.md § Phase 3.2 #3.

import { Container, Truck, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, SVGProps } from 'react';
import type { OnboardingStatus } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';

interface Props {
  status: OnboardingStatus;
}

const ICONS: Record<
  Exclude<OnboardingStatus, 'COMPLETE'>,
  ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
> = {
  PENDING_VEHICLE: Truck,
  PENDING_TRAILER: Container,
  PENDING_DRIVER: UserRound,
};

const ARIA_ENTITY_KEY: Record<
  Exclude<OnboardingStatus, 'COMPLETE'>,
  string
> = {
  PENDING_VEHICLE: 'onboardingStatus.entity.vehicle',
  PENDING_TRAILER: 'onboardingStatus.entity.trailer',
  PENDING_DRIVER: 'onboardingStatus.entity.driver',
};

export function OnboardingStatusBadge({ status }: Props) {
  const t = useTranslations();
  // No badge for healthy rows — absence is the signal.
  if (status === 'COMPLETE') return null;

  const Icon = ICONS[status];
  const label = t(`onboardingStatus.${status}`);
  const ariaLabel = `${t('onboardingStatus.ariaPrefix')}${t(ARIA_ENTITY_KEY[status])}`;

  return (
    <Badge
      variant="onboarding-pending"
      role="status"
      aria-label={ariaLabel}
      // Override the default Badge rounding/typography so the pill matches
      // the spec recipe (rounded-full, uppercase, tracking-wide, 11px text,
      // whitespace-nowrap).
      className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide whitespace-nowrap gap-1"
    >
      <Icon size={11} aria-hidden="true" />
      {label}
    </Badge>
  );
}
