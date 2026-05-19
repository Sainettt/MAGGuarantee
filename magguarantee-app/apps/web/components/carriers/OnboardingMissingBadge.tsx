// Phase 3.2 (rewritten after `Carrier.onboardingStatus` was dropped) —
// onboarding-completeness chips rendered in the carriers DataTable.
//
// Returns `null` when the carrier's onboarding is complete (hasVehicle &&
// hasTrailer && hasDriver) — 95%+ of rows are healthy, so absence-of-badge
// remains the implicit "all good" signal, same convention as the old single-
// status badge.
//
// When incomplete, renders one chip per missing entity (vehicle / trailer /
// driver). Each chip uses the existing `onboarding-pending` Badge variant
// introduced in Phase 3.2 — same warning-orange surface, icon + word do the
// disambiguation, not color.
//
// Per docs/14-design-system.md § Phase 3.2 #3, updated for the derived
// `Carrier.onboarding` block (see packages/shared/src/schemas/carriers.ts).

import { Container, Truck, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, SVGProps } from 'react';
import type { OnboardingDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';

interface Props {
  onboarding: OnboardingDto;
}

type MissingEntity = 'vehicle' | 'trailer' | 'driver';

const ICONS: Record<
  MissingEntity,
  ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
> = {
  vehicle: Truck,
  trailer: Container,
  driver: UserRound,
};

export function OnboardingMissingBadge({ onboarding }: Props) {
  const t = useTranslations();

  // No chips for healthy rows — absence is the signal.
  if (onboarding.isComplete) return null;

  const missing: MissingEntity[] = [];
  if (!onboarding.hasVehicle) missing.push('vehicle');
  if (!onboarding.hasTrailer) missing.push('trailer');
  if (!onboarding.hasDriver) missing.push('driver');

  // Defensive — if isComplete was somehow false but no individual flag is
  // false, render nothing rather than an empty group.
  if (missing.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t('onboardingMissing.groupLabel')}
      className="flex flex-wrap gap-1"
    >
      {missing.map((entity) => {
        const Icon = ICONS[entity];
        const label = t(`onboardingMissing.${entity}`);
        return (
          <Badge
            key={entity}
            variant="onboarding-pending"
            // The chip is purely informational — `aria-label` carries the
            // full word so screen-reader users don't need to interpret the
            // icon. Icon is decorative.
            aria-label={label}
            // Match the spec recipe used by the old badge so visual density
            // matches the table row design (rounded-full, uppercase 11px,
            // whitespace-nowrap so the chip never breaks mid-word).
            className="rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide whitespace-nowrap gap-1"
          >
            <Icon size={11} aria-hidden="true" />
            {label}
          </Badge>
        );
      })}
    </div>
  );
}
