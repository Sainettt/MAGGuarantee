// Phase 3 — wrapper around <Badge> that maps a ClaimStatus or
// DelegationStatus enum to the brand-appropriate variant + icon + PL label.
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

import { Badge } from '@/components/ui/Badge';
import type { ClaimStatus, DelegationStatus } from '@magguarantee/shared';

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'muted';

interface StatusMeta {
  variant: Variant;
  label: string;
  icon: LucideIcon;
}

const CLAIM_META: Record<ClaimStatus, StatusMeta> = {
  NA_WERYFIKACJI: { variant: 'info', label: 'Weryfikacja', icon: Clock },
  ZAAKCEPTOWANO: {
    variant: 'success',
    label: 'Zaakceptowano',
    icon: CheckCircle2,
  },
  ODRZUCONO: { variant: 'danger', label: 'Odrzucono', icon: XCircle },
  REKLAMACJA: { variant: 'warning', label: 'Reklamacja', icon: AlertTriangle },
  OCZEKUJE_NA_AUTORYZACJE: {
    variant: 'info',
    label: 'Czeka na autoryzację',
    icon: Clock,
  },
  AUTORYZACJA_KWOTA_MAKSIMA: {
    variant: 'warning',
    label: 'Autoryzacja — kwota maks.',
    icon: AlertTriangle,
  },
};

const DELEGATION_META: Record<DelegationStatus, StatusMeta> = {
  zgloszony: { variant: 'info', label: 'Zgłoszony', icon: Clock },
  w_trasie: { variant: 'success', label: 'W trasie', icon: Truck },
  zjechal: { variant: 'muted', label: 'Zjechał', icon: CheckCircle2 },
  anulowany: { variant: 'danger', label: 'Anulowany', icon: XCircle },
};

export interface StatusBadgeProps {
  status: ClaimStatus | DelegationStatus;
  className?: string;
}

function isClaimStatus(s: string): s is ClaimStatus {
  return s in CLAIM_META;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = isClaimStatus(status)
    ? CLAIM_META[status]
    : DELEGATION_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className={className}>
      <Icon size={12} className="mr-1" aria-hidden />
      {meta.label}
    </Badge>
  );
}
