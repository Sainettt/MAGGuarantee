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
//   ./claims.ts        — TBD Phase 4
//   ./delegations.ts   — TBD Phase 7
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
export * from './lookups';
export * from './integrations';
