'use client';

// docs/14 §17.1 — status chip of a planner-transfer request. A thin wrapper
// over the existing <Badge> (like <VehicleStatusBadge>): existing variants
// only. The status is carried by the TEXT; colour + icon only reinforce it.

import { Ban, CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PlannerTransferStatus } from '@magguarantee/shared';

import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

/** Presentation-only mapping (not in shared — it is purely visual). */
export const TRANSFER_STATUS_META: Record<
  PlannerTransferStatus,
  { variant: NonNullable<BadgeProps['variant']>; icon: LucideIcon }
> = {
  // «A person still has to move this forward» — same amber as `gotowy`.
  pending: { variant: 'warning', icon: Clock },
  approved: { variant: 'success', icon: CheckCircle2 },
  rejected: { variant: 'danger', icon: XCircle },
  // Withdrawn by the author — neutral, not an error.
  cancelled: { variant: 'muted', icon: Ban },
};

export interface TransferStatusBadgeProps {
  status: PlannerTransferStatus;
  className?: string;
  /** Native tooltip (e.g. «Wniosek o przekazanie do: …» next to «Planista»). */
  title?: string;
}

export default function TransferStatusBadge({
  status,
  className,
  title,
}: TransferStatusBadgeProps) {
  const t = useTranslations('transfers.status');
  const { variant, icon: Icon } = TRANSFER_STATUS_META[status];
  return (
    <Badge
      variant={variant}
      title={title}
      className={cn('gap-1 whitespace-nowrap', className)}
    >
      <Icon size={12} aria-hidden="true" />
      {t(status)}
    </Badge>
  );
}

export { TransferStatusBadge };
