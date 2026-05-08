'use client';

// Phase 3 — wrapper around <Badge> that maps a ClaimStatus or
// DelegationStatus enum to the brand-appropriate variant + icon + label.
// Labels are translated via next-intl (`carrier.claims.status.*` and
// `carrier.delegations.status.*`).
//
// Per docs/14 § Phase 3, this lives under `components/carrier/` because
// carriers are the first consumers; the employee verification UI in
// Phase 4 imports the same component.

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  type LucideIcon,
  Truck,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/Badge';
import type { ClaimStatus, DelegationStatus } from '@magguarantee/shared';

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'muted';

interface StatusMeta {
  variant: Variant;
  icon: LucideIcon;
}

const CLAIM_META: Record<ClaimStatus, StatusMeta> = {
  NA_WERYFIKACJI: { variant: 'info', icon: Clock },
  ZAAKCEPTOWANO: { variant: 'success', icon: CheckCircle2 },
  ODRZUCONO: { variant: 'danger', icon: XCircle },
  REKLAMACJA: { variant: 'warning', icon: AlertTriangle },
  OCZEKUJE_NA_AUTORYZACJE: { variant: 'info', icon: Clock },
  AUTORYZACJA_KWOTA_MAKSIMA: { variant: 'warning', icon: AlertTriangle },
};

const DELEGATION_META: Record<DelegationStatus, StatusMeta> = {
  zgloszony: { variant: 'info', icon: Clock },
  w_trasie: { variant: 'success', icon: Truck },
  zjechal: { variant: 'muted', icon: CheckCircle2 },
  anulowany: { variant: 'danger', icon: XCircle },
};

export interface StatusBadgeProps {
  status: ClaimStatus | DelegationStatus;
  className?: string;
}

function isClaimStatus(s: string): s is ClaimStatus {
  return s in CLAIM_META;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tClaim = useTranslations('carrier.claims.status');
  const tDelegation = useTranslations('carrier.delegations.status');

  const isClaim = isClaimStatus(status);
  const meta = isClaim
    ? CLAIM_META[status as ClaimStatus]
    : DELEGATION_META[status as DelegationStatus];
  const Icon = meta.icon;
  const label = isClaim
    ? tClaim(status as ClaimStatus)
    : tDelegation(status as DelegationStatus);

  return (
    <Badge variant={meta.variant} className={className}>
      <Icon size={12} className="mr-1" aria-hidden />
      {label}
    </Badge>
  );
}
