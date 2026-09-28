// Root query key of the planner-transfer lists (docs/14 §17.9). Kept in its own
// dependency-free module so `useVehicles` can invalidate it (a vehicle
// deactivation / deletion cancels the vehicle's pending request server-side)
// without an import cycle with `usePlannerTransfers`.
export const PLANNER_TRANSFERS_KEY = ['plannerTransfers'] as const;
