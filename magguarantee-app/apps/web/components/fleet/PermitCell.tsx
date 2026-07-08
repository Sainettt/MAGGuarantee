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
//
// Centering: the parent `<td>` only sets `text-align: center`, which centers
// inline content (the em-dash) but NOT the block-level `<svg>` — Tailwind
// Preflight makes every svg `display: block`, so a bare `<Check>` would hug the
// cell's left edge while the dash stayed centered (the columns visually drift
// apart). Wrapping both states in a `flex justify-center` container centers them
// uniformly, independent of the cell's `text-align`.

import { Check } from 'lucide-react';

/** Compact boolean cell — a success check when set, em-dash otherwise. */
export function PermitCell({
  value,
  label,
}: {
  value: boolean | null | undefined;
  label: string;
}) {
  return (
    <span className="flex justify-center">
      {value ? (
        <Check size={16} className="text-success" aria-label={label} />
      ) : (
        <span aria-hidden className="text-text-sub">
          —
        </span>
      )}
    </span>
  );
}
