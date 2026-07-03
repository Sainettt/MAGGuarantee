// Shared compact boolean cell for the fleet «Auta» tables.
//
// Hoisted out of `CarrierFleetPanel.tsx` (2026-07-03) once three surfaces — the
// carrier panel, the shared planista/dyspozytor `FleetVehiclesTable`, and the
// opieka drill-down — needed the identical GB/IT/FR compliance renderer. Keeps
// one definition instead of three copies (DS §6.3.4 "lift shared fleet cells").
//
// Renders a success-toned `Check` when the permit is granted, an inert em-dash
// otherwise. `value` is `boolean | null | undefined` because the slim
// `VehicleListItem` types `gb/it/fr` as nullable.

import { Check } from 'lucide-react';

/** Compact boolean cell — a success check when set, em-dash otherwise. */
export function PermitCell({
  value,
  label,
}: {
  value: boolean | null | undefined;
  label: string;
}) {
  return value ? (
    <Check size={16} className="text-success" aria-label={label} />
  ) : (
    <span aria-hidden className="text-text-sub">
      —
    </span>
  );
}
