// Schemas namespace re-export hub.
//
// Add new domains here as they ship — one file per domain:
//   ./auth.ts          — login/verify/refresh contracts (Phase 1)
//   ./common.ts        — shared primitives (UUIDs, dates, pagination)
//   ./users.ts         — admin user CRUD (Wave 3)
//   ./carriers.ts      — carriers (Wave 3)
//   ./vehicles.ts      — vehicles (Wave 3)
//   ./drivers.ts       — drivers (Wave 3)
//   ./trailers.ts      — trailers (Wave 3)
//   ./trailer-types.ts — trailer-type lookup CRUD (Wave 3)
//   ./lookups.ts       — read-only people pickers (Wave 3)
//   ./integrations/    — VIES / Biała Lista / info-car / GPS (Wave 4)
//   ./claims.ts        — Phase 3 — claims (wnioski) submit/preview/reklamacja
//   ./delegations.ts   — Phase 3 — delegations submit/cancel
//   ./fleet.ts         — Phase 3 — fleet aggregates (GET /fleet/my)
//
// Convention: per-file we export the request schema, the response schema,
// and inferred types alongside (DTOs). Both api and web import from
// `@magguarantee/shared` (which re-exports this folder).

export * from './common';
export * from './auth';
export * from './users';
export * from './carriers';
export * from './vehicles';
export * from './drivers';
export * from './trailers';
export * from './trailer-types';
// Phase 11 — dispatch teams (admin CRUD + /lookups/teams).
export * from './teams';
export * from './lookups';
export * from './integrations';
export * from './claims';
export * from './delegations';
export * from './fleet';
// Guarantee Watchdog — compliance board + episode archive (plan §5).
export * from './guarantee-watchdog';
// Phase 5 — opiekun-scoped surface (carriers sidebar).
export * from './opiekun';
// Phase 4.5 — admin ops (limits / audit / diagnostics).
export * from './limits';
export * from './audit';
export * from './diagnostics';
