'use client';

// REWORK 2026-07-31 — the reklamacja OUTCOME chip (docs/14 §"Reklamacja —
// carrier claim-detail outcome block" + §6.5.15).
//
// After the rework a decided reklamacja no longer lives in the claim status:
// the wniosek rolls back to `statusBeforeReklamacja`, so `<StatusBadge>` reads
// exactly as it did before the complaint was ever filed. The outcome is carried
// ONLY by `claim.reklamacjaResolution` (`null` = pending), which is what this
// chip renders.
//
// Deliberately a THIN <Badge> wrapper — a `resolution → {variant, label, icon}`
// map, exactly like <StatusBadge> — and shared by BOTH panels (carrier detail /
// <ClaimCard>, employee <ClaimsTable> / <ClaimModal>), so the vocabulary can
// never drift between them. 0 new tokens.
//
// NEVER render it in the <StatusBadge> slot: two chips in one slot read as two
// statuses (docs/14, locked).

import {
  AlertTriangle,
  CheckCircle2,
  type LucideIcon,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReklamacjaResolution } from '@magguarantee/shared';

import { Badge, type BadgeProps } from '@/components/ui/Badge';

type Variant = NonNullable<BadgeProps['variant']>;

interface ResolutionMeta {
  variant: Variant;
  icon: LucideIcon;
  /** Key under the shared `claim.reklamacja.resolution` namespace. */
  key: 'pending' | 'uznana' | 'odrzucona';
}

const PENDING_META: ResolutionMeta = {
  variant: 'warning',
  icon: AlertTriangle,
  key: 'pending',
};

const RESOLUTION_META: Record<ReklamacjaResolution, ResolutionMeta> = {
  UZNANA: { variant: 'success', icon: CheckCircle2, key: 'uznana' },
  ODRZUCONA: { variant: 'danger', icon: XCircle, key: 'odrzucona' },
};

export interface ReklamacjaResolutionChipProps {
  /**
   * `claim.reklamacjaResolution` — `null` means "filed, awaiting a decision".
   * Only render the chip when `reklamacjaSubmitted === true`; a `null`
   * resolution on a claim that never had a reklamacja is NOT "pending".
   */
  resolution: ReklamacjaResolution | null;
  className?: string;
}

export function ReklamacjaResolutionChip({
  resolution,
  className,
}: ReklamacjaResolutionChipProps) {
  const t = useTranslations('claim.reklamacja.resolution');

  const meta = resolution === null ? PENDING_META : RESOLUTION_META[resolution];
  const Icon = meta.icon;

  return (
    <Badge variant={meta.variant} className={className}>
      <Icon size={12} className="mr-1 shrink-0" aria-hidden />
      {t(meta.key)}
    </Badge>
  );
}

export default ReklamacjaResolutionChip;
