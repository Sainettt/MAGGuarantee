'use client';

// Phase 11 — <TeamFieldValue>. The `value` cell for a vehicle's «Zespół» field
// inside an <EntityDetailModal> `fullWidth` row (admin VehicleDetailModal +
// read-only FleetVehicleDetailModal — docs/14 §6.4.2, §7.9.6).
//
// A `fullWidth` row collapses the label gutter (the <dt> goes sr-only), so this
// renders its own visible inline caption above the body — mirroring the
// DelegationDetailModal «Notatki» fullWidth pattern — then either:
//   • <TeamMembers> when a team is assigned (it owns the members / empty-team /
//     inactive states), or
//   • the «Brak zespołu dyspozytorów» amber box when the vehicle has NO team
//     (no team object exists, so the empty-members box can't be used — §7.9.7).

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleDispatchTeamDto } from '@magguarantee/shared';

import { TeamMembers } from '@/components/teams/TeamMembers';

const CAPTION_CLASS =
  'mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub';

interface Props {
  team: VehicleDispatchTeamDto | null;
  /** Visible inline caption (the field label, e.g. «Zespół»). */
  label: string;
}

export function TeamFieldValue({ team, label }: Props) {
  const tTeam = useTranslations('team');

  return (
    <div>
      <span className={CAPTION_CLASS}>{label}</span>
      {team ? (
        <TeamMembers team={team} variant="chips" size="md" />
      ) : (
        // No `dispatchTeam` at all — distinct from "team exists but unstaffed".
        <div className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-bold text-warning">
          <AlertTriangle size={12} aria-hidden="true" />
          {tTeam('noTeam')}
        </div>
      )}
    </div>
  );
}
