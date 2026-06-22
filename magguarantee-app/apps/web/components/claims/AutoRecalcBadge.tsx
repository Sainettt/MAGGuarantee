'use client';

// §7.10.4 — the STATIC auto-recalc badge in the pracownik ClaimModal's linked-
// delegation context row. Reports a server-side HISTORICAL event: when a late
// `zjechal` carried an `actualReturnAt` ≠ the claim's filed period, the backend
// either AUTO-APPLIED the recalc (claim not yet decided AND period not human-
// edited) or SKIPPED it (decided OR `periodAdjustedByVerifier`).
//
// REWORK 2026-06-20 #4 — the state is now read DIRECTLY from the explicit
// `ClaimDto.autoRecalcState` ('none' | 'applied' | 'skipped'); the old field-
// comparison heuristic (`resolveAutoRecalcState`) has been removed. The badge
// renders nothing for `none`.
//
// This is distinct from §6.5.4's LIVE `<RecalcBadge>` (the debounced
// "Przeliczam…/Aktualne" by the dopłata value). Both may be visible. EXISTING
// tones only (no new variant):
//   • applied → success «Przeliczono wg faktycznej daty zjazdu»
//   • skipped → warning «Wymaga uwagi: …» (amber attention, NEVER danger)

import { AlertTriangle, RefreshCw } from 'lucide-react';

import type { ClaimAutoRecalcState } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';

interface Props {
  /** The explicit DTO state. `none` renders nothing. */
  state: ClaimAutoRecalcState;
  label: string;
  /** Optional tooltip (the §7.10.4 «Okres zaktualizowany…» / «Pominięto…» copy). */
  title?: string;
}

export function AutoRecalcBadge({ state, label, title }: Props) {
  if (state === 'none') return null;

  const applied = state === 'applied';
  const Icon = applied ? RefreshCw : AlertTriangle;
  return (
    <Badge variant={applied ? 'success' : 'warning'} title={title}>
      <Icon size={12} className="mr-1" aria-hidden />
      {label}
    </Badge>
  );
}
